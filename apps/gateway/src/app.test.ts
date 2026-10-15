import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app.js";

test("GET /health returns gateway health", async () => {
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      status: "ok",
      service: "urumi-gateway",
    });
  } finally {
    await app.close();
  }
});

test("GET /admin/upstreams returns an empty list initially", async () => {
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/admin/upstreams",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), []);
  } finally {
    await app.close();
  }
});

test("POST /admin/upstreams registers a valid upstream", async () => {
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/admin/upstreams",
      payload: {
        id: "test-store",
        name: "Test Store",
        url: "http://127.0.0.1:3999/mcp",
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().id, "test-store");
    assert.equal(response.json().status, "unreachable");
    assert.equal("credentials" in response.json(), false);
  } finally {
    await app.close();
  }
});

test("POST /admin/upstreams rejects invalid URLs", async () => {
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/admin/upstreams",
      payload: {
        id: "bad-url",
        name: "Bad URL",
        url: "file:///tmp/example",
      },
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("POST /admin/upstreams rejects duplicate IDs", async () => {
  const app = buildApp();
  const payload = {
    id: "duplicate-store",
    name: "Duplicate Store",
    url: "http://127.0.0.1:3998/mcp",
  };

  try {
    const first = await app.inject({
      method: "POST",
      url: "/admin/upstreams",
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/admin/upstreams",
      payload,
    });

    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 409);
  } finally {
    await app.close();
  }
});

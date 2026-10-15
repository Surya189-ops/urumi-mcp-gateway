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

test("PATCH /admin/upstreams/:id updates an existing upstream", async () => {
  const app = buildApp();
  const id = "patch-test-store";

  try {
    const created = await app.inject({
      method: "POST",
      url: "/admin/upstreams",
      payload: {
        id,
        name: "Original Store",
        url: "http://127.0.0.1:3997/mcp",
        enabled: false,
      },
    });
    assert.equal(created.statusCode, 201);

    const updated = await app.inject({
      method: "PATCH",
      url: `/admin/upstreams/${id}`,
      payload: { name: "Updated Store" },
    });

    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().name, "Updated Store");
    assert.equal(updated.json().enabled, false);
    assert.equal(updated.json().status, "disabled");
  } finally {
    await app.close();
  }
});

test("PATCH /admin/upstreams/:id rejects invalid updates", async () => {
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "PATCH",
      url: "/admin/upstreams/missing-store",
      payload: { url: "file:///tmp/example" },
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("PATCH /admin/upstreams/:id returns 404 for a missing upstream", async () => {
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "PATCH",
      url: "/admin/upstreams/no-such-store",
      payload: { name: "Updated Store" },
    });

    assert.equal(response.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("PATCH /admin/upstreams/:id disables an upstream", async () => {
  const app = buildApp();
  const id = "disable-test-store";

  try {
    const created = await app.inject({
      method: "POST",
      url: "/admin/upstreams",
      payload: {
        id,
        name: "Disable Test Store",
        url: "http://127.0.0.1:3996/mcp",
        enabled: false,
      },
    });
    assert.equal(created.statusCode, 201);

    const response = await app.inject({
      method: "PATCH",
      url: `/admin/upstreams/${id}`,
      payload: { enabled: false },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().enabled, false);
    assert.equal(response.json().status, "disabled");
  } finally {
    await app.close();
  }
});

test("PATCH /admin/upstreams/:id re-enables an upstream and records failed connection", async () => {
  const app = buildApp();
  const id = "reenable-test-store";

  try {
    const created = await app.inject({
      method: "POST",
      url: "/admin/upstreams",
      payload: {
        id,
        name: "Re-enable Test Store",
        url: "http://127.0.0.1:3995/mcp",
        enabled: false,
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().status, "disabled");

    const response = await app.inject({
      method: "PATCH",
      url: `/admin/upstreams/${id}`,
      payload: { enabled: true },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().enabled, true);
    assert.equal(response.json().status, "unreachable");
  } finally {
    await app.close();
  }
});

test("DELETE /admin/upstreams/:id removes an existing upstream", async () => {
  const app = buildApp();
  const id = "delete-test-store";

  try {
    const created = await app.inject({
      method: "POST",
      url: "/admin/upstreams",
      payload: {
        id,
        name: "Delete Test Store",
        url: "http://127.0.0.1:3994/mcp",
        enabled: false,
      },
    });
    assert.equal(created.statusCode, 201);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/admin/upstreams/${id}`,
    });

    assert.equal(deleted.statusCode, 204);

    const listed = await app.inject({
      method: "GET",
      url: "/admin/upstreams",
    });

    assert.equal(
      listed.json().some((server: { id: string }) => server.id === id),
      false,
    );
  } finally {
    await app.close();
  }
});

test("DELETE /admin/upstreams/:id returns 404 for a missing upstream", async () => {
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "DELETE",
      url: "/admin/upstreams/does-not-exist",
    });

    assert.equal(response.statusCode, 404);
  } finally {
    await app.close();
  }
});

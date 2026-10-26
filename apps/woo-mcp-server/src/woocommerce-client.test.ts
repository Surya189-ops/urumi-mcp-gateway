import test from "node:test";
import assert from "node:assert/strict";
import { WooCommerceClient } from "./woocommerce-client.js";

async function withCredentials(
  url: string,
  run: (capturedUrl: string, authorization: string | null) => void,
) {
  const originalFetch = globalThis.fetch;
  const previous = {
    url: process.env.WOOCOMMERCE_URL,
    key: process.env.WOOCOMMERCE_CONSUMER_KEY,
    secret: process.env.WOOCOMMERCE_CONSUMER_SECRET,
  };

  process.env.WOOCOMMERCE_URL = url;
  process.env.WOOCOMMERCE_CONSUMER_KEY = "test_key";
  process.env.WOOCOMMERCE_CONSUMER_SECRET = "test_secret";

  let capturedUrl = "";
  let authorization: string | null = null;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    authorization = new Headers(init?.headers).get("Authorization");
    return new Response(JSON.stringify([{ id: 1, name: "Test product" }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const woo = new WooCommerceClient();
    const products = await woo.request<Array<{ id: number; name: string }>>(
      "products",
      { query: { page: 1, per_page: 5 } },
    );
    assert.equal(products[0]?.name, "Test product");
    run(capturedUrl, authorization);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of [
      ["WOOCOMMERCE_URL", previous.url],
      ["WOOCOMMERCE_CONSUMER_KEY", previous.key],
      ["WOOCOMMERCE_CONSUMER_SECRET", previous.secret],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("uses query-string OAuth for plain HTTP WooCommerce", async () => {
  await withCredentials("http://127.0.0.1:8080", (capturedUrl, authorization) => {
    const url = new URL(capturedUrl);
    assert.equal(url.searchParams.get("oauth_consumer_key"), "test_key");
    assert.ok(url.searchParams.get("oauth_signature"));
    assert.equal(url.searchParams.get("consumer_secret"), null);
    assert.equal(authorization, null);
  });
});

test("uses Authorization OAuth for HTTPS WooCommerce", async () => {
  await withCredentials("https://store.example.test", (capturedUrl, authorization) => {
    const url = new URL(capturedUrl);
    assert.ok(authorization?.startsWith("OAuth "));
    assert.equal(url.searchParams.get("oauth_consumer_key"), null);
    assert.equal(url.searchParams.get("oauth_signature"), null);
    assert.ok(!capturedUrl.includes("test_secret"));
  });
});

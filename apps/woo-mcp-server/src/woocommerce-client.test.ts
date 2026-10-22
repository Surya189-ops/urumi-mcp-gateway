import test from "node:test";
import assert from "node:assert/strict";
import { WooCommerceClient } from "./woocommerce-client.js";

test("sends WooCommerce credentials in Authorization, not the URL", async () => {
  const originalFetch = globalThis.fetch;
  const previous = {
    url: process.env.WOOCOMMERCE_URL,
    key: process.env.WOOCOMMERCE_CONSUMER_KEY,
    secret: process.env.WOOCOMMERCE_CONSUMER_SECRET,
  };

  process.env.WOOCOMMERCE_URL = "http://127.0.0.1:8080";
  process.env.WOOCOMMERCE_CONSUMER_KEY = "test_key";
  process.env.WOOCOMMERCE_CONSUMER_SECRET = "test_secret";

  let capturedUrl = "";
  let capturedAuthorization: string | null = null;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    const headers = new Headers(init?.headers);
    capturedAuthorization = headers.get("Authorization");

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
    assert.ok(capturedAuthorization?.startsWith("OAuth "));
    assert.ok(!capturedUrl.includes("test_key"));
    assert.ok(!capturedUrl.includes("test_secret"));
    assert.ok(!capturedUrl.includes("consumer_key"));
    assert.ok(!capturedUrl.includes("consumer_secret"));
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
});

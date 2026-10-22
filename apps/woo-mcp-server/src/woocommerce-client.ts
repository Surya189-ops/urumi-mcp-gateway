import { createHmac, randomBytes } from "node:crypto";

export interface WooProduct {
  id: number;
  name: string;
  type: string;
  status: string;
  sku: string;
  price: string;
}

export interface WooOrder {
  id: number;
  status: string;
  total: string;
  currency: string;
  date_created: string;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
  };
  line_items: Array<{
    product_id: number;
    name: string;
    quantity: number;
    total: string;
  }>;
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export class WooCommerceClient {
  private readonly baseUrl: string;
  private readonly consumerKey: string;
  private readonly consumerSecret: string;

  constructor() {
    const url = process.env.WOOCOMMERCE_URL;
    const key = process.env.WOOCOMMERCE_CONSUMER_KEY;
    const secret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

    if (!url || !key || !secret) {
      throw new Error(
        "WOOCOMMERCE_URL, WOOCOMMERCE_CONSUMER_KEY, and WOOCOMMERCE_CONSUMER_SECRET must be configured.",
      );
    }

    this.baseUrl = `${url.replace(/\/+$/, "")}/wp-json/wc/v3`;
    this.consumerKey = key;
    this.consumerSecret = secret;
  }

  private authorization(method: string, url: URL): string {
    const oauth: Record<string, string> = {
      oauth_consumer_key: this.consumerKey,
      oauth_nonce: randomBytes(16).toString("hex"),
      oauth_signature_method: "HMAC-SHA256",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_version: "1.0",
    };

    const parameters = [
      ...Array.from(url.searchParams.entries()),
      ...Object.entries(oauth),
    ].map(([key, value]) => [encode(key), encode(value)] as const)
      .sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv));

    const normalized = parameters.map(([key, value]) => `${key}=${value}`).join("&");
    const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;
    const baseString = [
      method.toUpperCase(),
      encode(baseUrl),
      encode(normalized),
    ].join("&");
    const signature = createHmac("sha256", `${encode(this.consumerSecret)}&`)
      .update(baseString)
      .digest("base64");

    oauth.oauth_signature = signature;

    return `OAuth ${Object.entries(oauth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${encode(key)}="${encode(value)}"`)
      .join(", ")}`;
  }

  async request<T>(
    resource: string,
    options: {
      method?: "GET" | "POST" | "PUT";
      query?: Record<string, string | number | undefined>;
      body?: unknown;
    } = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${resource.replace(/^\/+/, "")}`);

    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const method = options.method ?? "GET";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: this.authorization(method, url),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `WooCommerce API returned HTTP ${response.status}: ${errorText.slice(0, 300)}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("WooCommerce API request timed out after 10 seconds.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

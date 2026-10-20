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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${this.consumerKey}:${this.consumerSecret}`,
          ).toString("base64")}`,
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

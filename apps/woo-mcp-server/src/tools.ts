import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WooCommerceClient, type WooOrder, type WooProduct } from "./woocommerce-client.js";



export function registerWooCommerceTools(
  server: McpServer,
  woo: WooCommerceClient,
): void {
  server.registerTool(
    "list_products",
    {
      title: "List WooCommerce products",
      description: "List products from the WooCommerce store.",
      inputSchema: {
        page: z.number().int().min(1).default(1),
        per_page: z.number().int().min(1).max(100).default(10),
        search: z.string().trim().max(100).optional(),
      },
    },
    async ({ page, per_page, search }) => {
      const products = await woo.request<WooProduct[]>("products", {
        query: { page, per_page, search },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(products) }],
      };
    },
  );

  server.registerTool(
    "create_product",
    {
      title: "Create WooCommerce product",
      description: "Create a simple product in WooCommerce.",
      inputSchema: {
        name: z.string().trim().min(1).max(200),
        regular_price: z.string().regex(/^\d+(\.\d{1,2})?$/),
        description: z.string().max(5000).optional(),
        sku: z.string().trim().max(100).optional(),
      },
    },
    async ({ name, regular_price, description, sku }) => {
      const product = await woo.request<WooProduct>("products", {
        method: "POST",
        body: {
          name,
          type: "simple",
          regular_price,
          description: description ?? "",
          ...(sku ? { sku } : {}),
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(product) }],
      };
    },
  );

  server.registerTool(
    "list_orders",
    {
      title: "List WooCommerce orders",
      description: "List recent WooCommerce orders, optionally filtered by status.",
      inputSchema: {
        page: z.number().int().min(1).default(1),
        per_page: z.number().int().min(1).max(100).default(10),
        status: z.enum([
          "pending", "processing", "on-hold", "completed",
          "cancelled", "refunded", "failed",
        ]).optional(),
        after: z.string().datetime().optional(),
        before: z.string().datetime().optional(),
      },
    },
    async ({ page, per_page, status, after, before }) => {
      const orders = await woo.request<WooOrder[]>("orders", {
        query: { page, per_page, status, after, before },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(orders) }],
      };
    },
  );

  server.registerTool(
    "get_order",
    {
      title: "Get WooCommerce order",
      description: "Retrieve one WooCommerce order by its numeric ID.",
      inputSchema: { order_id: z.number().int().positive() },
    },
    async ({ order_id }) => {
      const order = await woo.request<WooOrder>(`orders/${order_id}`);
      return {
        content: [{ type: "text", text: JSON.stringify(order) }],
      };
    },
  );

  server.registerTool(
    "update_order_status",
    {
      title: "Update WooCommerce order status",
      description: "Update the status of an existing WooCommerce order.",
      inputSchema: {
        order_id: z.number().int().positive(),
        status: z.enum([
          "pending", "processing", "on-hold", "completed",
          "cancelled", "refunded",
        ]),
      },
    },
    async ({ order_id, status }) => {
      const order = await woo.request<WooOrder>(`orders/${order_id}`, {
        method: "PUT",
        body: { status },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(order) }],
      };
    },
  );
}

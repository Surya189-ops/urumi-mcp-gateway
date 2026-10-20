import { useCallback, useEffect, useState, type FormEvent } from "react";

type Upstream = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  status: "connected" | "unreachable" | "disabled" | string;
  lastError?: string;
};

type Props = {
  apiKey: string;
};

export default function UpstreamsPanel({ apiKey }: Props) {
  const [servers, setServers] = useState<Upstream[]>([]);
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const response = await fetch(path, {
        ...init,
        headers: {
          "X-Urumi-API-Key": apiKey,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });

      if (response.status === 204) {
        if (!response.ok) throw new Error("Request failed.");
        return null;
      }

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const detail =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : `Request failed (${response.status}).`;
        throw new Error(detail);
      }

      return body;
    },
    [apiKey],
  );

  const loadServers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const body = await request("/api/admin/upstreams");
      if (!Array.isArray(body)) {
        throw new Error("Unexpected upstream list response from the gateway.");
      }
      setServers(body as Upstream[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load servers.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  async function addServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await request("/api/admin/upstreams", {
        method: "POST",
        body: JSON.stringify({
          id: id.trim(),
          name: name.trim(),
          url: url.trim(),
          enabled: true,
        }),
      });
      setId("");
      setName("");
      setUrl("");
      setMessage("Upstream registration submitted.");
      await loadServers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not register server.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleServer(server: Upstream) {
    setError("");
    setMessage("");

    try {
      await request(`/api/admin/upstreams/${encodeURIComponent(server.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !server.enabled }),
      });
      setMessage(`${server.name} updated.`);
      await loadServers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update server.");
    }
  }

  async function editServer(server: Upstream) {
    const nextName = window.prompt("Server name:", server.name);
    if (nextName === null) return;

    const nextUrl = window.prompt("MCP server URL:", server.url);
    if (nextUrl === null) return;

    if (!nextName.trim() || !nextUrl.trim()) {
      setError("Server name and URL cannot be empty.");
      return;
    }

    setError("");
    setMessage("");

    try {
      await request(`/api/admin/upstreams/${encodeURIComponent(server.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: nextName.trim(), url: nextUrl.trim() }),
      });
      setMessage(`${server.name} updated.`);
      await loadServers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not edit server.");
    }
  }

  async function deleteServer(server: Upstream) {
    if (!window.confirm(`Delete upstream "${server.name}"?`)) return;

    setError("");
    setMessage("");

    try {
      await request(`/api/admin/upstreams/${encodeURIComponent(server.id)}`, {
        method: "DELETE",
      });
      setMessage(`${server.name} deleted.`);
      await loadServers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete server.");
    }
  }

  return (
    <section className="management-panel" aria-labelledby="upstreams-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ADMINISTRATION</span>
          <h2 id="upstreams-heading">Upstream MCP servers</h2>
          <p>Register and manage the MCP servers connected to your team gateway.</p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void loadServers()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <p className="error-message" role="alert">{error}</p>}
      {message && <p className="success-message" role="status">{message}</p>}

      <form className="server-form" onSubmit={addServer}>
        <h3>Register an upstream</h3>
        <label htmlFor="upstream-id">Unique server ID</label>
        <input
          id="upstream-id"
          value={id}
          onChange={(event) => setId(event.target.value)}
          placeholder="e.g. woo-commerce"
          required
        />

        <label htmlFor="upstream-name">Display name</label>
        <input
          id="upstream-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. WooCommerce"
          required
        />

        <label htmlFor="upstream-url">MCP endpoint URL</label>
        <input
          id="upstream-url"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="http://woocommerce-mcp:8080/mcp"
          required
        />

        <button type="submit" disabled={saving}>
          {saving ? "Registering…" : "Register server"}
        </button>
        <p className="form-hint">
          Use a reachable HTTP(S) MCP endpoint. Internal service URLs are
          appropriate when the server runs inside the cluster.
        </p>
      </form>

      <div className="server-list-heading">
        <h3>Registered servers</h3>
        <span>{servers.length} total</span>
      </div>

      {loading && servers.length === 0 ? (
        <p>Loading upstream servers…</p>
      ) : servers.length === 0 ? (
        <p className="empty-state">No upstream servers registered yet.</p>
      ) : (
        <div className="server-list">
          {servers.map((server) => (
            <article className="server-card" key={server.id}>
              <div className="server-card-heading">
                <div>
                  <h4>{server.name}</h4>
                  <p className="mono">{server.id}</p>
                </div>
                <span className={`server-status status-${server.status}`}>
                  {server.status}
                </span>
              </div>
              <p className="server-url">{server.url}</p>
              {server.lastError && (
                <p className="error-detail">{server.lastError}</p>
              )}
              <div className="server-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void toggleServer(server)}
                >
                  {server.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void editServer(server)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => void deleteServer(server)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

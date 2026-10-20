import { StrictMode, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Identity = {
  userId: string;
  apiKeyId: string;
  role: "admin" | "member";
};

function App() {
  const [apiKey, setApiKey] = useState("");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIdentity(null);
    setLoading(true);

    try {
      const response = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "Authentication failed. Check your API key.";
        throw new Error(message);
      }

      if (
        typeof body !== "object" ||
        body === null ||
        !("userId" in body) ||
        !("apiKeyId" in body) ||
        !("role" in body) ||
        typeof body.userId !== "string" ||
        typeof body.apiKeyId !== "string" ||
        (body.role !== "admin" && body.role !== "member")
      ) {
        throw new Error("The gateway returned an unexpected identity response.");
      }

      setIdentity({
        userId: body.userId,
        apiKeyId: body.apiKeyId,
        role: body.role,
      });
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? "Cannot reach the gateway. Check that it is running and the dashboard proxy is configured."
          : cause instanceof Error
            ? cause.message
            : "Sign-in failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    setIdentity(null);
    setApiKey("");
    setError("");
  }

  return (
    <main className="app-shell">
      <section className="welcome-card">
        <span className="eyebrow">URUMI · MCP GATEWAY</span>
        <h1>Your team's tools, securely connected.</h1>
        <p>
          Sign in with your personal gateway API key to manage team tools and
          inspect activity. Your key stays in this page's memory.
        </p>

        {identity ? (
          <section className="identity-panel" aria-live="polite">
            <div className="status-row">
              <span className="status-dot" />
              Authenticated with the gateway
            </div>
            <h2>You're connected.</h2>
            <dl className="identity-details">
              <div>
                <dt>Role</dt>
                <dd><span className="role-pill">{identity.role}</span></dd>
              </div>
              <div>
                <dt>User ID</dt>
                <dd className="mono">{identity.userId}</dd>
              </div>
              <div>
                <dt>API key ID</dt>
                <dd className="mono">{identity.apiKeyId}</dd>
              </div>
            </dl>
            <p className="notice">
              Identity verified. Management panels will be connected in the
              next steps.
            </p>
            <button className="secondary-button" onClick={signOut} type="button">
              Sign out
            </button>
          </section>
        ) : (
          <form className="login-form" onSubmit={signIn}>
            <label htmlFor="api-key">Personal API key</label>
            <input
              id="api-key"
              name="api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste your gateway API key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              required
            />
            <button type="submit" disabled={loading || !apiKey.trim()}>
              {loading ? "Verifying…" : "Sign in securely"}
            </button>
            {error && <p className="error-message" role="alert">{error}</p>}
            <p className="form-hint">
              Use an API key issued by your gateway administrator. Never share
              your key with another team member.
            </p>
          </form>
        )}

        <div className="status-row footer-status">
          <span className="status-dot" />
          Gateway identity verification
        </div>
      </section>
    </main>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

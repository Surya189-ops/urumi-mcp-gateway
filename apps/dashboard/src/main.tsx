import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main className="app-shell">
      <section className="welcome-card">
        <span className="eyebrow">URUMI · MCP GATEWAY</span>
        <h1>Your team's tools, securely connected.</h1>
        <p>
          Manage MCP servers, team access, API keys, and tool activity from
          one place.
        </p>
        <div className="status-row">
          <span className="status-dot" />
          Dashboard foundation ready
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

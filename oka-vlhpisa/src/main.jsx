import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

function showFatalError(err) {
  const root = document.getElementById("root");
  const msg = err && (err.stack || err.message) ? (err.stack || err.message) : String(err);
  const html =
    '<div style="max-width:720px;margin:10vh auto;padding:24px;border:1px solid #fca5a5;background:#fef2f2;border-radius:12px;font:14px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#7f1d1d">' +
    '<div style="font-size:18px;font-weight:600;margin-bottom:8px">Oka Vlhpisa could not start</div>' +
    '<div style="margin-bottom:12px">Something went wrong while loading the app. Please send the text below to your administrator.</div>' +
    '<pre style="white-space:pre-wrap;background:#fff;border:1px solid #fecaca;padding:12px;border-radius:8px;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#7f1d1d;overflow:auto;max-height:40vh">' +
    String(msg).replace(/</g, "&lt;") +
    "</pre></div>";
  if (root) root.innerHTML = html;
  else document.body.innerHTML = html;
  try { console.error("Oka Vlhpisa fatal:", err); } catch (e) {}
}

window.addEventListener("error", (e) => showFatalError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showFatalError(e.reason));

function mount() {
  try {
    const target = document.getElementById("root");
    if (!target) throw new Error('Could not find #root element in the page.');
    ReactDOM.createRoot(target).render(<App />);
  } catch (err) {
    showFatalError(err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}

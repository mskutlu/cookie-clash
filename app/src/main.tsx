import { Buffer } from "buffer";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./App.css";

// @solana/web3.js expects a Buffer global in the browser
(globalThis as unknown as { Buffer: unknown }).Buffer = (globalThis as unknown as { Buffer?: unknown }).Buffer ?? Buffer;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

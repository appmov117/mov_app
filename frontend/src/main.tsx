import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { LiveSync } from "./components/LiveSync.tsx";
import { AuthProvider } from "./lib/auth.tsx";
import { persistOptions, queryClient } from "./lib/queryCache.ts";
import "./index.css";

// iOS ignora user-scalable=no; se bloquea el pellizco a nivel documento. El mapa usa eventos touch y no se ve afectado.
for (const type of ["gesturestart", "gesturechange"]) {
  document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <BrowserRouter>
        <AuthProvider>
          <LiveSync />
          <App />
        </AuthProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);

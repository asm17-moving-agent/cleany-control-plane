import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./app/App";
import { OperationsProvider } from "./operations/OperationsContext";
import { DemoModeProvider } from "./operations/DemoModeContext";
import { SettingsProvider } from "./settings/SettingsContext";
import { AuthProvider, AuthGate } from "./auth/AuthContext";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <BrowserRouter>
          <AuthProvider><AuthGate><DemoModeProvider>
            <OperationsProvider>
              <App />
            </OperationsProvider>
          </DemoModeProvider></AuthGate></AuthProvider>
        </BrowserRouter>
      </SettingsProvider>
    </QueryClientProvider>
  </StrictMode>,
);

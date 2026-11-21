// Establish cascade layers before any component stylesheet is evaluated.
import "./styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { App } from "./app/App";
import { OperationsProvider } from "./operations/OperationsContext";
import { DemoModeProvider } from "./operations/DemoModeContext";
import { SettingsProvider } from "./settings/SettingsContext";
import { AuthProvider, AuthGate } from "./auth/AuthContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Data-router navigation enables the layout editor's push/back/forward blocker.
const router = createBrowserRouter([{ path: "*", element:
  <AuthProvider><AuthGate><DemoModeProvider><OperationsProvider><App /></OperationsProvider></DemoModeProvider></AuthGate></AuthProvider>,
}]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <RouterProvider router={router} />
      </SettingsProvider>
    </QueryClientProvider>
  </StrictMode>,
);

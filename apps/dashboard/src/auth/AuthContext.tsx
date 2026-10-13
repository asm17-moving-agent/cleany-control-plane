import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { configureClient } from "../api/client";
import type { components } from "../api/generated/openapi";
import { Navigate, useLocation } from "react-router";
import { LoginPage } from "./LoginPage";

export type Session = components["schemas"]["SessionResponse"];
export type Site = components["schemas"]["SiteResponse"];
interface AuthValue {
  session: Session | null;
  sites: Site[];
  site: Site | null;
  loading: boolean;
  error: string;
  login: (loginId: string, password: string) => Promise<void>;
  changePassword: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectSite: (siteId: string) => void;
}
const AuthContext = createContext<AuthValue | null>(null);
export function useAuthOptional() { return useContext(AuthContext); }
export function useAuth() {
  const value = useAuthOptional();
  if (!value) throw new Error("AuthProvider required");
  return value;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const clear = useCallback(() => {
    generation.current += 1;
    void queryClient.cancelQueries(); queryClient.clear(); configureClient(null, null);
    setSession(null); setSites([]); setSite(null);
  }, [queryClient]);
  async function call(path: string, body?: unknown) {
    const response = await fetch("/api/auth/" + path, body === undefined ? undefined : {
      method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": session?.csrf_token ?? "" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(typeof payload.detail === "string" ? payload.detail : "입력 내용을 확인해 주세요.");
    }
    return response.status === 204 ? null : response.json();
  }
  async function apply(value: Session) {
    clear();
    const current = generation.current;
    configureClient(value.csrf_token, null); setSession(value);
    if (value.must_change_password) return;
    const response = await fetch("/api/sites");
    if (generation.current !== current) return;
    if (!response.ok) { clear(); throw new Error("시설 정보를 불러오지 못했습니다."); }
    const available = (await response.json()).items as Site[];
    if (generation.current !== current) return;
    const selectedId = new URLSearchParams(window.location.search).get("site");
    const selected = available.find(item => item.site_id === selectedId) ?? available[0] ?? null;
    configureClient(value.csrf_token, selected?.site_id ?? null);
    setSites(available); setSite(selected);
  }
  useEffect(() => {
    let active = true;
    fetch("/api/auth/me").then(response => response.ok ? response.json() : null)
      .then(async value => { if (active && value) await apply(value); })
      .catch(() => { if (active) setError("서버에 연결하지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    const expired = () => { if (active) { clear(); setError("로그인이 만료되었습니다. 다시 로그인해 주세요."); } };
    window.addEventListener("cleany:auth-expired", expired);
    return () => { active = false; window.removeEventListener("cleany:auth-expired", expired); };
    // Startup authentication runs once, independent of password form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clear]);
  useEffect(() => {
    if (!session || session.must_change_password) return;
    let lastTouch = 0;
    const activity = () => {
      if (Date.now() - lastTouch < 60_000) return;
      lastTouch = Date.now();
      void call("session/touch", {}).catch(() => clear());
    };
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    const timer = window.setInterval(() => {
      if (Date.now() / 1000 >= session.expires_at) clear();
    }, 10_000);
    return () => { window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity); window.clearInterval(timer); };
  }, [session, clear]);
  async function act(task: () => Promise<void>) {
    setError("");
    try { await task(); } catch (failure) { setError((failure as Error).message); throw failure; }
  }
  return <AuthContext.Provider value={{ session, sites, site, loading, error,
    login: (loginId, password) => act(async () => apply(await call("login", { login_id: loginId, password }))),
    changePassword: password => act(async () => apply(await call("password/change", { password }))),
    logout: async () => { try { await call("logout", {}); } catch { /* Local access is cleared even if the server is unreachable. */ } finally { clear(); } },
    selectSite: siteId => {
      const next = sites.find(item => item.site_id === siteId);
      if (!next || !session) return;
      void queryClient.cancelQueries(); queryClient.clear();
      configureClient(session.csrf_token, siteId); setSite(next);
      const url = new URL(window.location.href); url.searchParams.set("site", siteId);
      window.history.replaceState(null, "", url);
    },
  }}>{children}</AuthContext.Provider>;
}

export function AuthGate({ children }: PropsWithChildren) {
  const { loading, session, site, logout } = useAuth();
  const location = useLocation();
  if (location.pathname === "/welcome") return <Navigate to="/login" replace />;
  if (loading) return <main className="auth-screen" role="status">계정 확인 중…</main>;
  if (!session || session.must_change_password) return <LoginPage />;
  if (location.pathname === "/login") return <Navigate to="/" replace />;
  if (!site) return <main className="auth-screen"><h1>연결된 매장이 없습니다</h1><p>회사 담당자에게 매장 연결을 요청해 주세요.</p><button onClick={() => void logout()}>로그아웃</button></main>;
  return <div key={`${session.user_id}:${site.site_id}`}>{children}</div>;
}

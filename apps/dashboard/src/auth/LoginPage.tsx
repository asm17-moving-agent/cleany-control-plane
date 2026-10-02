import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import wordmark from "../assets/brand/wordmark.png";
import "./auth.css";

export function LoginPage() {
  const { session, error, login, changePassword, logout } = useAuth();
  const changing = !!session?.must_change_password;
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setLocalError("");
    if (changing && password !== confirmation) { setLocalError("비밀번호가 일치하지 않습니다."); return; }
    setBusy(true);
    try {
      if (changing) await changePassword(password); else await login(loginId, password);
      setPassword(""); setConfirmation("");
    } catch { /* The provider displays the server error. */ }
    finally { setBusy(false); }
  }
  return <main className="auth-screen">
    <div className="auth-layout">
      <header className="auth-brand">
        <img src={wordmark} alt="Cleany" width="136" />
        <span>WORKSPACE</span>
      </header>
      <section className="auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title">{changing ? "비밀번호 변경" : "로그인"}</h1>
        <p className="auth-intro">{changing ? "처음 접속하셨네요. 새 비밀번호를 설정해 주세요." : "내 매장의 운영을 시작하세요."}</p>
        <form onSubmit={event => void submit(event)}>
          {!changing && <div className="auth-field"><label htmlFor="auth-login-id">아이디</label><input id="auth-login-id" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="발급받은 아이디" required maxLength={64} value={loginId} onChange={event => setLoginId(event.target.value)} /></div>}
          <div className="auth-field"><label htmlFor="auth-password">{changing ? "새 비밀번호" : "비밀번호"}</label><input id="auth-password" type="password" autoComplete={changing ? "new-password" : "current-password"} placeholder={changing ? "15자 이상 입력해 주세요" : "비밀번호를 입력해 주세요"} required minLength={changing ? 15 : 1} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} aria-describedby={changing ? "auth-password-hint" : undefined} />
          {changing && <small id="auth-password-hint">공백을 포함해 15~128자로 설정할 수 있어요.</small>}</div>
          {changing && <div className="auth-field"><label htmlFor="auth-confirmation">새 비밀번호 확인</label><input id="auth-confirmation" type="password" autoComplete="new-password" placeholder="새 비밀번호를 한 번 더 입력해 주세요" required minLength={15} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div>}
          {(localError || error) && <p className="auth-error" role="alert">{localError || error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}><span>{busy ? "처리 중…" : changing ? "변경하고 시작하기" : "로그인"}</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        </form>
        <div className="auth-help">{changing ? <button className="auth-secondary" onClick={() => void logout()}>다른 계정으로 로그인</button> : <><span>계정이 필요하거나 비밀번호를 잊으셨나요?</span><span>회사 담당자에게 발급·초기화를 요청해 주세요.</span></>}</div>
      </section>
      <footer className="auth-footer">© {new Date().getFullYear()} Cleany</footer>
    </div>
  </main>;
}

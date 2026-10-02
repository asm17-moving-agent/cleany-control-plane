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
  return <main className="auth-screen"><section className="auth-card">
    <img src={wordmark} alt="Cleany" width="144" />
    <h1>{changing ? "비밀번호 변경" : "로그인"}</h1>
    <p>{changing ? "임시 비밀번호를 대신할 새 비밀번호를 설정해 주세요." : "회사에서 받은 계정으로 로그인해 주세요."}</p>
    <form onSubmit={event => void submit(event)}>
      {!changing && <label>아이디<input autoComplete="username" required maxLength={64} value={loginId} onChange={event => setLoginId(event.target.value)} /></label>}
      <label>{changing ? "새 비밀번호" : "비밀번호"}<input type="password" autoComplete={changing ? "new-password" : "current-password"} required minLength={changing ? 15 : 1} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
      {changing && <><small>15자 이상 입력해 주세요. 공백도 사용할 수 있습니다.</small><label>새 비밀번호 확인<input type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label></>}
      {(localError || error) && <p className="auth-error" role="alert">{localError || error}</p>}
      <button type="submit" disabled={busy}>{busy ? "처리 중…" : changing ? "변경하고 시작하기" : "로그인"}</button>
    </form>
    {changing ? <button className="auth-secondary" onClick={() => void logout()}>로그아웃</button> : <small>계정 발급이나 비밀번호 초기화는 회사 담당자에게 요청해 주세요.</small>}
  </section></main>;
}

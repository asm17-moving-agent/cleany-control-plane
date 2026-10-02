import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import wordmark from "../assets/brand/wordmark.png";
import { AuthBackdrop } from "./AuthBackdrop";
import "./auth.css";

const messages = {
  ko: { login: "로그인", change: "비밀번호 변경", intro: "클리니와 함께, 더 편안한 공간 운영.", changeIntro: "처음 접속하셨네요. 새 비밀번호를 설정해 주세요.", id: "아이디", idPlaceholder: "발급받은 아이디를 입력해 주세요", password: "비밀번호", newPassword: "새 비밀번호", passwordPlaceholder: "비밀번호를 입력해 주세요", newPlaceholder: "15자 이상 입력해 주세요", hint: "공백을 포함해 15~128자로 설정할 수 있어요.", confirm: "새 비밀번호 확인", confirmPlaceholder: "새 비밀번호를 한 번 더 입력해 주세요", mismatch: "비밀번호가 일치하지 않습니다.", busy: "처리 중…", start: "변경하고 시작하기", other: "다른 계정으로 로그인", help: "계정이 필요하거나 비밀번호를 잊으셨나요?", contact: "회사 담당자에게 발급·초기화를 요청해 주세요.", language: "언어 선택", footer: "공간을 돌보는 작은 동료", genericError: "입력 내용을 확인한 뒤 다시 시도해 주세요." },
  en: { login: "Welcome back", change: "Set your password", intro: "A little help for your everyday workspace.", changeIntro: "Make yourself at home with a new password.", id: "Account ID", idPlaceholder: "Enter your account ID", password: "Password", newPassword: "New password", passwordPlaceholder: "Enter your password", newPlaceholder: "At least 15 characters", hint: "Use 15–128 characters. Spaces are welcome.", confirm: "Confirm password", confirmPlaceholder: "Enter your new password again", mismatch: "Your passwords don’t match.", busy: "Please wait…", start: "Save and get started", other: "Sign in with another account", help: "Need an account or forgot your password?", contact: "Contact your administrator for help.", language: "Select language", footer: "A little help for your everyday", genericError: "Please check your details and try again." },
};

export function LoginPage() {
  const { session, error, login, changePassword, logout } = useAuth();
  const [language, setLanguage] = useState<"ko" | "en">(() => {
    try { return localStorage.getItem("cleany-auth-language") === "en" ? "en" : "ko"; } catch { return "ko"; }
  });
  const text = messages[language];
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = language;
    try { localStorage.setItem("cleany-auth-language", language); } catch { /* Storage can be unavailable. */ }
    return () => { document.documentElement.lang = previous; };
  }, [language]);
  const changing = !!session?.must_change_password;
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setLocalError("");
    if (changing && password !== confirmation) { setLocalError(text.mismatch); return; }
    setBusy(true);
    try {
      if (changing) await changePassword(password); else await login(loginId, password);
      setPassword(""); setConfirmation("");
    } catch { /* The provider displays the server error. */ }
    finally { setBusy(false); }
  }
  return <main className="auth-screen" lang={language}>
    <header className="auth-topbar">
      <img src={wordmark} alt="Cleany" width="124" />
      <div className="auth-language">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18M5 6.5h14M5 17.5h14" /></svg>
        <select aria-label={text.language} value={language} onChange={event => { setLanguage(event.target.value as "ko" | "en"); setLocalError(""); }}><option value="ko">한국어</option><option value="en">English</option></select>
        <svg className="auth-language-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </div>
    </header>
    <AuthBackdrop />
    <div className="auth-layout">
      <section className="auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title">{changing ? text.change : text.login}</h1>
        <p className="auth-intro">{changing ? text.changeIntro : text.intro}</p>
        <form onSubmit={event => void submit(event)}>
          {!changing && <div className="auth-field"><label htmlFor="auth-login-id">{text.id}</label><input id="auth-login-id" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder={text.idPlaceholder} required maxLength={64} value={loginId} onChange={event => setLoginId(event.target.value)} /></div>}
          <div className="auth-field"><label htmlFor="auth-password">{changing ? text.newPassword : text.password}</label><input id="auth-password" type="password" autoComplete={changing ? "new-password" : "current-password"} placeholder={changing ? text.newPlaceholder : text.passwordPlaceholder} required minLength={changing ? 15 : 1} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} aria-describedby={changing ? "auth-password-hint" : undefined} />
          {changing && <small id="auth-password-hint">{text.hint}</small>}</div>
          {changing && <div className="auth-field"><label htmlFor="auth-confirmation">{text.confirm}</label><input id="auth-confirmation" type="password" autoComplete="new-password" placeholder={text.confirmPlaceholder} required minLength={15} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div>}
          {(localError || error) && <p className="auth-error" role="alert">{localError || (language === "ko" ? error : text.genericError)}</p>}
          <button className="auth-submit" type="submit" disabled={busy}><span>{busy ? text.busy : changing ? text.start : language === "ko" ? "로그인" : "Sign in"}</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        </form>
        <div className="auth-help">{changing ? <button className="auth-secondary" onClick={() => void logout()}>{text.other}</button> : <><span>{text.help}</span><span>{text.contact}</span></>}</div>
      </section>
      <footer className="auth-footer"><span>{text.footer}</span><span>© {new Date().getFullYear()} Cleany</span></footer>
    </div>
  </main>;
}

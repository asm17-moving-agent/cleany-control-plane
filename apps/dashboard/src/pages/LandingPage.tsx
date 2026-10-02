import { Link } from "react-router";
import wordmark from "../assets/brand/wordmark.png";
import "./landing.css";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h15m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function LandingPage({ signedIn = false }: { signedIn?: boolean }) {
  const destination = signedIn ? "/" : "/login";
  return <div className="landing">
    <a className="landing-skip" href="#landing-main">본문으로 이동</a>
    <header className="landing-nav">
      <Link to="/welcome" aria-label="Cleany 서비스 소개"><img src={wordmark} alt="cleany" width="118" /></Link>
      <nav aria-label="서비스 소개"><a href="#features">서비스 소개</a><a href="#how-it-works">이용 방법</a></nav>
      <Link className="landing-nav-login" to={destination}>{signedIn ? "대시보드" : "로그인"}<Arrow /></Link>
    </header>
    <main id="landing-main">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow"><span /> A LITTLE HELP. A BETTER SPACE.</div>
          <h1 id="landing-title">반복되는 정리,<br /><span>클리니에게.</span></h1>
          <p className="landing-hero-lead">당신은 더 중요한 일에 집중하세요.</p>
          <p className="landing-description">공간을 돌보는 로봇과, 운영을 한눈에 보는 대시보드.<br className="landing-desktop-break" /> 매일의 작은 번거로움을 클리니와 함께 덜어보세요.</p>
          <div className="landing-hero-actions"><Link className="landing-button landing-button-dark" to={destination}>{signedIn ? "내 매장으로 이동" : "클리니 시작하기"}<Arrow /></Link><a className="landing-text-link" href="#features">어떤 일을 하나요? <span>↘</span></a></div>
          <div className="landing-hero-note"><span className="landing-note-line" /> 공간에 맞춘 로봇 임대 서비스</div>
        </div>
        <div className="landing-hero-visual">
          <div className="landing-visual-top"><span>MEET YOUR NEW TEAMMATE</span><span className="landing-plus">＋</span></div>
          <div className="landing-orbit landing-orbit-one" /><div className="landing-orbit landing-orbit-two" />
          <span className="landing-watermark" aria-hidden="true">cleany</span>
          <img className="landing-robot" src="/models/cleany-exterior-poster.png" alt="양팔과 이동형 바퀴를 갖춘 클리니 로봇 외형 시안" width="630" height="630" fetchPriority="high" />
          <div className="landing-robot-tag"><span className="landing-status-dot" /><div><strong>공간을 돌보는 새로운 동료</strong><span>Cleany · 서비스 로봇</span></div></div>
          <div className="landing-visual-bottom"><span>DESIGNED FOR YOUR EVERYDAY</span><span>로봇 외형 시안</span></div>
        </div>
      </section>
      <div className="landing-principles"><span>일상에 자연스럽게,<br /><strong>운영은 더 간단하게.</strong></span><div><span>01</span> 필요한 곳에 작업 요청</div><div><span>02</span> 진행 상황을 한눈에</div><div><span>03</span> 결과까지 차곡차곡</div></div>
      <section className="landing-features landing-section" id="features" aria-labelledby="features-title">
        <div className="landing-section-heading"><div><span className="landing-eyebrow">LESS ROUTINE, MORE POSSIBILITY</span><h2 id="features-title">로봇의 일부터 매장의 일까지.<br />하나의 흐름으로.</h2></div><p>작업을 요청하고, 진행을 살피고, 결과를 확인하는 일.<br />복잡한 과정은 줄이고 필요한 정보에 집중합니다.</p></div>
        <div className="landing-feature-grid">
          <article className="landing-feature-card landing-feature-wide">
            <div className="landing-mini-window" aria-label="작업 관리 화면 예시"><div className="landing-window-top"><span><i /><i /><i /></span><span>CLEANY WORKSPACE · 화면 예시</span></div><div className="landing-mini-body"><div className="landing-mini-sidebar"><span className="landing-mini-logo">c.</span><span /><span /><span /></div><div className="landing-mini-content"><div className="landing-mini-title">오늘의 공간 <span>매장 01 ⌄</span></div><div className="landing-mini-map">{Array.from({ length: 12 }, (_, i) => <div key={i} className={i === 6 ? "selected" : ""}><span />{String(i + 1).padStart(2, "0")}<span /></div>)}<div className="landing-mini-map-pin">c.</div></div><div className="landing-mini-request"><span><i /> 선택한 공간에 작업을 요청하세요</span><span>작업 요청 ↗</span></div></div></div></div>
            <div className="landing-card-copy"><span className="landing-card-number">01 / REQUEST</span><h3>필요한 곳을 선택하면, 준비 끝.</h3><p>지도에서 작업할 좌석을 선택하고 요청하세요.<br />로봇에 전달된 작업을 대시보드에서 확인할 수 있어요.</p></div>
          </article>
          <article className="landing-feature-card landing-feature-track"><div className="landing-track-art" aria-hidden="true"><span className="landing-track-label">ONE CONNECTED WORKFLOW</span><div><span>요청</span><span className="landing-track-line" /><span className="landing-track-active">진행<small>↗</small></span><span className="landing-track-line" /><span>결과</span></div><p>시작부터 마무리까지, 연결된 흐름.</p></div><div className="landing-card-copy"><span className="landing-card-number">02 / FOLLOW THROUGH</span><h3>지금 어디까지 왔는지.</h3><p>로봇 상태와 작업 진행 상황을 살피고,<br />완료된 작업의 결과를 다시 확인하세요.</p></div></article>
        </div>
        <div className="landing-multi-site"><div className="landing-site-symbol" aria-hidden="true">▦</div><div><h3>매장이 늘어나도, 익숙한 방식으로.</h3><p>내 계정에 연결된 매장을 선택하고, 매장별 작업과 로봇을 확인하세요.</p></div><span className="landing-multi-tag">YOUR SPACES, CONNECTED <Arrow diagonal /></span></div>
      </section>
      <section className="landing-process" id="how-it-works" aria-labelledby="process-title"><div className="landing-section"><div className="landing-section-heading"><div><span className="landing-eyebrow">GETTING STARTED</span><h2 id="process-title">처음부터 함께 준비합니다.</h2></div><p>로봇 임대부터 운영 계정까지.<br />클리니 담당자의 안내에 따라 시작하세요.</p></div><div className="landing-steps">{[
        ["01", "공간에 맞게 준비", "담당자와 운영할 공간과 작업 범위를 확인하고, 로봇과 매장을 연결합니다."],
        ["02", "계정을 받아 로그인", "전달받은 아이디와 임시 비밀번호로 접속한 뒤, 나만의 비밀번호를 설정하세요."],
        ["03", "우리 매장 운영 시작", "대시보드에서 매장을 선택하고 작업을 요청하세요. 진행과 결과를 함께 확인할 수 있어요."],
      ].map(([number, title, description]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div></div></section>
      <section className="landing-bottom-cta"><div><span className="landing-eyebrow">READY WHEN YOU ARE</span><h2>더 여유로운 일상,<br />클리니와 시작하세요.</h2><p>이미 계정을 받으셨나요? 내 매장으로 접속해 보세요.</p></div><Link to={destination} className="landing-cta-circle" aria-label={signedIn ? "대시보드 열기" : "로그인하고 시작하기"}><Arrow diagonal /></Link></section>
    </main>
    <footer className="landing-footer"><Link to="/welcome"><img src={wordmark} alt="cleany" width="100" /></Link><p>A little help for your everyday.</p><span>© {new Date().getFullYear()} Cleany</span><a href="#landing-main">맨 위로 ↑</a></footer>
  </div>;
}

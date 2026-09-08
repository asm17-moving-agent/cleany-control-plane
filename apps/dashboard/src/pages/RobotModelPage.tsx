import { RobotModel } from "../components/RobotModel";
import { useEffect } from "react";
import { Link } from "react-router";
export function RobotModelPage() {
  useEffect(() => {
    const title = document.title;
    document.title = "로봇 프리뷰 · Cleany";
    return () => { document.title = title; };
  }, []);
  return <main className="robot-model-page"><nav className="robot-model-page-nav"><Link to="/robots">← 로봇 관리</Link><span>개발용 미리보기</span></nav><h1>로봇 프리뷰</h1><p>마우스를 올려 가볍게 둘러보고,<br />드래그하여 원하는 방향에서 확인하세요.</p><RobotModel /></main>;
}

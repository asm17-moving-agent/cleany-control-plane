import { RobotModel } from "../components/RobotModel";
import { useEffect } from "react";
import { Link } from "react-router";
export function RobotModelPage() {
  useEffect(() => { document.title = "모델 둘러보기 · Cleany"; }, []);
  return <main className="robot-model-page"><nav className="robot-model-page-nav"><Link to="/robots">← 로봇 관리</Link><span>CLEANY · MODEL STUDIO</span></nav><h2>Cleany 모델</h2><p>로봇의 구조를 살펴보는 3D 미리보기입니다. 실제 로봇의 현재 자세를 표시하지 않습니다.</p><RobotModel initiallyOpen /></main>;
}

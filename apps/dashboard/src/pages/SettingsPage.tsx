import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { type DashboardSettings, useSettings } from "../settings/SettingsContext";

const settingsSchema = z.object({
  refreshSeconds: z.enum(["5", "10", "30"]),
  liveStatus: z.boolean(),
  defaultPriority: z.enum(["NORMAL", "HIGH"]),
  completionNotification: z.boolean(),
});

export function SettingsPage() {
  const { settings, saveSettings } = useSettings();
  const [message, setMessage] = useState("");
  const { register, handleSubmit } = useForm<DashboardSettings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings,
  });
  const submit = handleSubmit((values) => {
    saveSettings(values);
    setMessage("이 브라우저에 설정을 저장했습니다.");
  });

  return (
    <section className="workspace dashboard-view section-view settings-view">
      <div className="view-intro"><p className="eyebrow">OPERATION SETTINGS</p><h2>관제 설정</h2><p>이 브라우저에서 사용할 화면 및 요청 기본값을 설정합니다.</p></div>
      <form className="settings-layout" onSubmit={submit}>
        <section className="panel settings-card">
          <div className="settings-heading"><span className="settings-icon">↻</span><div><h3>데이터 갱신</h3><p>관제 화면의 자동 갱신 방식을 설정합니다.</p></div></div>
          <label className="field-row"><span><strong>자동 갱신 주기</strong><small>SSE 오류 시 보조 polling 주기</small></span><select {...register("refreshSeconds")}><option value="5">5초</option><option value="10">10초</option><option value="30">30초</option></select></label>
          <label className="switch-row"><span><strong>실시간 상태 표시</strong><small>연결 상태와 최근 heartbeat 표시</small></span><input type="checkbox" {...register("liveStatus")} /><i /></label>
        </section>
        <section className="panel settings-card">
          <div className="settings-heading"><span className="settings-icon">!</span><div><h3>Mission 기본값</h3><p>새 좌석 작업 요청에 적용할 초기값입니다.</p></div></div>
          <label className="field-row"><span><strong>기본 우선순위</strong><small>요청 화면을 열 때 선택되는 값</small></span><select {...register("defaultPriority")}><option value="NORMAL">보통 (NORMAL)</option><option value="HIGH">높음 (HIGH)</option></select></label>
          <label className="switch-row"><span><strong>완료 알림</strong><small>Mission이 종료되면 화면에 상태 반영</small></span><input type="checkbox" {...register("completionNotification")} /><i /></label>
        </section>
        <section className="panel settings-card settings-about">
          <div className="settings-heading"><span className="settings-icon">i</span><div><h3>시나리오 환경</h3><p>현재 실행 중인 관제 프로토타입 정보입니다.</p></div></div>
          <dl className="detail-list"><div><dt>환경</dt><dd>Local Mock</dd></div><div><dt>Dashboard</dt><dd>v1.11.0</dd></div><div><dt>Backend API</dt><dd>/api</dd></div></dl>
        </section>
        <div className="settings-actions"><p aria-live="polite">{message}</p><button className="submit-mission settings-save" type="submit">설정 저장</button></div>
      </form>
    </section>
  );
}

import { PageHeader, PanelHeader, Surface } from "../components/patterns";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { type DashboardSettings, useSettings } from "../settings/SettingsContext";

const settingsSchema = z.object({
  refreshSeconds: z.enum(["5", "10", "30"]),
  liveStatus: z.boolean(),
  defaultPriority: z.enum(["NORMAL", "HIGH"]),
  completionNotification: z.boolean(),
});

/** Validate and explicitly save this browser's preferences; edits stay local until submission. */
export function SettingsPage() {
  const { settings, saveSettings } = useSettings();
  const [message, setMessage] = useState("");
  const { register, handleSubmit, control } = useForm<DashboardSettings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings,
  });
  const submit = handleSubmit((values) => {
    saveSettings(values);
    setMessage("이 브라우저에 설정을 저장했습니다.");
  });

  return (
    <section className="workspace dashboard-view section-view settings-view">
      <PageHeader title="관제 설정" description="이 브라우저에서 사용할 화면 및 요청 기본값을 설정합니다." />
      <form className="settings-layout" onSubmit={submit}>
        <Surface className="settings-card">
          <PanelHeader className="settings-heading" title="데이터 갱신" description="관제 화면의 자동 갱신 방식을 설정합니다." icon={<span className="settings-icon" aria-hidden="true">↻</span>} />
          <label className="field-row"><span><strong>자동 갱신 주기</strong><small>SSE 오류 시 보조 polling 주기</small></span><NativeSelect {...register("refreshSeconds")}><option value="5">5초</option><option value="10">10초</option><option value="30">30초</option></NativeSelect></label>
          <label className="switch-row"><span><strong>실시간 상태 표시</strong><small>연결 상태와 최근 heartbeat 표시</small></span><Controller name="liveStatus" control={control} render={({ field }) => <Switch aria-label="실시간 상태 표시" name={field.name} checked={field.value} onCheckedChange={field.onChange} onBlur={field.onBlur} ref={field.ref} />} /></label>
        </Surface>
        <Surface className="settings-card">
          <PanelHeader className="settings-heading" title="Mission 기본값" description="새 좌석 작업 요청에 적용할 초기값입니다." icon={<span className="settings-icon" aria-hidden="true">!</span>} />
          <label className="field-row"><span><strong>기본 우선순위</strong><small>요청 화면을 열 때 선택되는 값</small></span><NativeSelect {...register("defaultPriority")}><option value="NORMAL">보통 (NORMAL)</option><option value="HIGH">높음 (HIGH)</option></NativeSelect></label>
          <label className="switch-row"><span><strong>완료 알림</strong><small>Mission이 종료되면 화면에 상태 반영</small></span><Controller name="completionNotification" control={control} render={({ field }) => <Switch aria-label="완료 알림" name={field.name} checked={field.value} onCheckedChange={field.onChange} onBlur={field.onBlur} ref={field.ref} />} /></label>
        </Surface>
        <Surface className="settings-card settings-about">
          <PanelHeader className="settings-heading" title="시나리오 환경" description="현재 실행 중인 관제 프로토타입 정보입니다." icon={<span className="settings-icon" aria-hidden="true">i</span>} />
          <dl className="detail-list"><div><dt>환경</dt><dd>Local Mock</dd></div><div><dt>Dashboard</dt><dd>v1.11.0</dd></div><div><dt>Backend API</dt><dd>/api</dd></div></dl>
        </Surface>
        <div className="settings-actions"><p aria-live="polite">{message}</p><Button variant="primary" size="default" className="submit-mission settings-save" type="submit">설정 저장</Button></div>
      </form>
    </section>
  );
}

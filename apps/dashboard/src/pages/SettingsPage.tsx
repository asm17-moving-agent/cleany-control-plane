import { PageHeader, Surface } from "../components/patterns";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useSettings } from "../settings/SettingsContext";

const settingsSchema = z.object({
  refreshSeconds: z.enum(["5", "10", "30"]),
  defaultPriority: z.enum(["NORMAL", "HIGH"]),
});

/** Only consumed settings are editable; preserve dormant preferences in local storage. */
export function SettingsPage() {
  const { settings, saveSettings } = useSettings();
  const [message, setMessage] = useState("");
  const { register, handleSubmit } = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { refreshSeconds: settings.refreshSeconds, defaultPriority: settings.defaultPriority },
  });
  const submit = handleSubmit((values) => {
    saveSettings({ ...settings, ...values });
    setMessage("저장됨");
  });
  return <section className="workspace dashboard-view section-view settings-view">
    <PageHeader title="관제 설정" action={<span className="ops-note">이 브라우저에만 적용</span>} />
    <form className="settings-layout" onSubmit={submit}>
      <Surface className="settings-card">
        <label className="field-row"><span><strong>연결 끊김 시 갱신 간격</strong></span><NativeSelect {...register("refreshSeconds")}><option value="5">5초</option><option value="10">10초</option><option value="30">30초</option></NativeSelect></label>
        <label className="field-row"><span><strong>기본 우선순위</strong></span><NativeSelect {...register("defaultPriority")}><option value="NORMAL">보통</option><option value="HIGH">높음</option></NativeSelect></label>
      </Surface>
      <div className="settings-actions"><p aria-live="polite">{message}</p><Button variant="primary" className="settings-save" type="submit">설정 저장</Button></div>
    </form>
  </section>;
}

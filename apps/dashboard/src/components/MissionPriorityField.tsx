import type { Priority } from "../api/types";
import { Field } from "./patterns";
import { NativeSelect } from "./ui/native-select";

export function MissionPriorityField({ id, value, disabled, onChange }: { id: string; value: Priority; disabled?: boolean; onChange: (priority: Priority) => void }) {
  return <Field label="우선순위" htmlFor={id}><NativeSelect id={id} value={value} disabled={disabled} onChange={e => onChange(e.target.value as Priority)}><option value="NORMAL">보통</option><option value="HIGH">높음</option></NativeSelect></Field>;
}

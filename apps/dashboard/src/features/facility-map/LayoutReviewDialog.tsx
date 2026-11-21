import { Dialog } from "radix-ui";
import { Button } from "../../components/ui/button";
import { StatusBadge } from "../../components/patterns";
import type { layoutChanges } from "./seat-layout-editor";

export function LayoutReviewDialog({ open, onClose, changes, error, busy, onSave }: {
  open: boolean; onClose: () => void; changes: ReturnType<typeof layoutChanges>; error: string; busy: boolean; onSave: () => void;
}) {
  return <Dialog.Root open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="layout-review-overlay" />
      <Dialog.Content className="layout-review-dialog" onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => { if (busy) e.preventDefault(); }}>
        <header><Dialog.Title>변경사항 확인</Dialog.Title><StatusBadge tone="warning">저장 후 미검증</StatusBadge></header>
        <Dialog.Description>변경 {changes.length}건 · 로봇 접근점은 현장 확인이 필요합니다.</Dialog.Description>
        <div className="layout-review-table"><table><thead><tr><th>대상</th><th>변경</th><th>내용</th></tr></thead><tbody>
          {changes.map(row => <tr key={row.id}><td>{row.label}</td><td>{row.action}</td><td>{row.details}</td></tr>)}
        </tbody></table></div>
        {error && <p role="alert" className="ui-notice" data-tone="danger">{error}</p>}
        <footer><Button disabled={busy} onClick={onClose}>계속 편집</Button><Button variant="primary" disabled={busy || !changes.length} onClick={onSave}>{busy ? "저장 중…" : "변경사항 저장"}</Button></footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

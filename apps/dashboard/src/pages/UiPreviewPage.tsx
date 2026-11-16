import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { NativeSelect } from "../components/ui/native-select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../components/ui/dropdown-menu";
import { Switch } from "../components/ui/switch";
import { Field, Notice, PageHeader, PanelHeader, StatusBadge, Surface, type Tone } from "../components/patterns";
export function UiPreviewPage() {
 const [checked, setChecked] = useState(true);
 return <main style={{padding:24, maxWidth:1200, margin:'auto', display:'grid', gap:20}}>
  <PageHeader title="Cleany UI" description="40px 균형형 · 도메인 명령을 전송하지 않는 디자인 시스템 표본" />
  <Surface><PanelHeader title="버튼" /><div style={{display:'flex',gap:12,flexWrap:'wrap'}}>{(['primary','secondary','ghost','danger-outline','danger'] as const).map(variant=><Button key={variant} variant={variant}>{variant}</Button>)}<Button disabled>사용 불가</Button><Button disabled aria-busy="true">처리 중…</Button></div></Surface>
  <Surface><PanelHeader title="메뉴" /><DropdownMenu><DropdownMenuTrigger asChild><Button>메뉴 열기</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>작업 보기</DropdownMenuItem><DropdownMenuItem disabled>사용 불가</DropdownMenuItem></DropdownMenuContent></DropdownMenu></Surface>
  <Surface><PanelHeader title="크기" /><div style={{display:'flex',gap:12,alignItems:'center'}}>{(['compact','default','large'] as const).map(size=><Button key={size} size={size}>{size}</Button>)}</div></Surface>
  <Surface><PanelHeader title="폼" /><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}><Field label="이름" htmlFor="ui-name"><Input id="ui-name" placeholder="입력" /></Field><Field label="선택" htmlFor="ui-choice"><NativeSelect id="ui-choice"><option>전체</option></NativeSelect></Field><Field label="오류" htmlFor="ui-error" hint="입력 내용을 확인하세요."><Input id="ui-error" aria-invalid="true" aria-describedby="ui-error-hint" /></Field></div><label className="switch-row">실시간 표시<Switch checked={checked} onCheckedChange={setChecked} /></label></Surface>
  <Surface><PanelHeader title="상태와 안내" /><div style={{display:'flex',gap:12}}>{(['neutral','info','success','waiting','warning','danger'] as Tone[]).map(tone=><StatusBadge key={tone} tone={tone}>{tone}</StatusBadge>)}</div><Notice tone="warning">연결 상태를 확인해 주세요.</Notice><Notice tone="danger" role="alert">요청을 보내지 못했습니다.</Notice></Surface>
 </main>;
}

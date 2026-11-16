import { ChevronIcon } from "../components/WorkspaceIcons";
import { useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import type { FacilitySelection } from "../app/AppShell";
import { PageShell, PageHeader, PanelHeader, Surface, StatusBadge } from "../components/patterns";
import { Button } from "../components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../components/ui/chart";
import { averageOccupancy, completedByType, getHomeSnapshot, minuteLabel } from "../features/operations-home/home-data";
import "../features/operations-home/operations-home.css";

const chartConfig = {
  occupied: { label: "평균 점유", color: "var(--chart-occupancy)" },
  vacant: { label: "평균 미점유", color: "var(--color-neutral-soft)" },
  rate: { label: "점유율", color: "var(--chart-occupancy)" },
  count: { label: "처리 건수", color: "var(--chart-work)" },
} satisfies ChartConfig;
const cleaningConfig = [
  { key: "complete", label: "완료" }, { key: "working", label: "진행 중" }, { key: "needed", label: "정리 필요" },
] as const;

/** Café overview, using an isolated display-only snapshot rather than robot telemetry. */
export function MonitoringPage() {
  const { floor } = useOutletContext<FacilitySelection>();
  const [params] = useSearchParams();
  const [asOf, setAsOf] = useState(() => new Date());
  const scenario = params.get("homeScenario") === "attention" ? "attention" : "normal";
  const snapshot = useMemo(() => getHomeSnapshot(floor.id, asOf, scenario), [floor.id, asOf, scenario]);
  const average = snapshot ? averageOccupancy(snapshot.occupancy) : null;
  const bars = snapshot ? completedByType(snapshot.completions, snapshot.asOfMinute) : [];
  const trend = snapshot?.occupancy.flatMap((item, index) => [
    ...(index === 0 ? [{ minute: item.startMinute, rate: item.occupied / item.capacity * 100 }] : []),
    { minute: item.endMinute, rate: item.occupied / item.capacity * 100 },
  ]) ?? [];
  const attention = snapshot && (!snapshot.robot.connected || snapshot.reviewCount > 0);
  return <PageShell width="standard" flow="document" className="cafe-home" aria-label="스터디카페 운영 현황">
    <PageHeader title="운영 현황" action={<div className="cafe-header-actions"><StatusBadge>예시 데이터</StatusBadge>{snapshot && <time dateTime={`${snapshot.day}T${minuteLabel(snapshot.asOfMinute)}:00+09:00`}>{snapshot.day.replaceAll("-", ". ")} · {minuteLabel(snapshot.asOfMinute)} 기준</time>}<Button variant="secondary" onClick={() => setAsOf(new Date())}>새로고침</Button></div>} />
    {!snapshot ? <Surface className="cafe-empty"><h3>예시 데이터 없음</h3><p>{floor.label}</p></Surface> : <>
      {attention && <div className="cafe-alert" role="alert"><div><strong>관리자 확인 필요</strong><span>로봇 연결 끊김 · 결과 검토 {snapshot.reviewCount}건</span></div><div><Button asChild variant="danger-outline"><Link to="/robots">로봇 보기</Link></Button><Button asChild variant="secondary"><Link to="/missions?filter=REVIEW">결과 보기</Link></Button></div></div>}
      <div className="cafe-grid">
        <Surface className="cafe-card cafe-cleaning" aria-label="좌석 정리 현황">
          <PanelHeader title="좌석 정리 현황" action={<Button asChild variant="ghost" size="compact"><Link to="/map">지도 보기 <ChevronIcon aria-hidden="true" /></Link></Button>} />
          <div className="cafe-seat-total"><strong>{snapshot.capacity}<small>석</small></strong><span>현재 정리 상태</span></div>
          <div className="cafe-seat-grid" role="img" aria-label={`전체 ${snapshot.capacity}석, 완료 ${snapshot.cleaning.complete}석, 진행 중 ${snapshot.cleaning.working}석, 정리 필요 ${snapshot.cleaning.needed}석`}>
            {cleaningConfig.flatMap(({ key }) => Array.from({ length: snapshot.cleaning[key] }, (_, index) => <span key={`${key}-${index}`} data-cleaning={key} aria-hidden="true" />))}
          </div>
          <dl className="cafe-cleaning-legend">{cleaningConfig.map(({ key, label }) => <div key={key}><dt><i data-cleaning={key} />{label}</dt><dd>{snapshot.cleaning[key]}<small>석</small></dd></div>)}</dl>
        </Surface>
        <Surface className="cafe-card" aria-label="오늘 평균 점유율">
          <PanelHeader title="오늘 평균 점유율" />
          <div className="cafe-donut">
            <ChartContainer config={chartConfig} style={{ height: 210, width: "100%", aspectRatio: "auto" }}>
              <PieChart accessibilityLayer aria-label={average === null ? "점유 데이터 없음" : `오늘 평균 점유율 ${Math.round(average)}%`}>
                <Pie data={average === null ? [{ name: "vacant", value: 100, fill: "var(--color-neutral-soft)" }] : [{ name: "occupied", value: average, fill: "var(--color-occupied)" }, { name: "vacant", value: 100 - average, fill: "var(--color-vacant)" }]} dataKey="value" nameKey="name" innerRadius={70} outerRadius={92} strokeWidth={0} startAngle={90} endAngle={-270} isAnimationActive={false} />
              </PieChart>
            </ChartContainer>
            <div className="cafe-donut-value"><strong>{average === null ? "—" : Math.round(average)}{average !== null && <small>%</small>}</strong><span>오늘 평균</span></div>
          </div>
          <p className="cafe-chart-caption">{average === null ? "집계 시작 전" : `00:00–${minuteLabel(snapshot.asOfMinute)} · 전체 ${snapshot.capacity}석 기준`}</p>
        </Surface>
      </div>
      <div className="cafe-grid cafe-grid--equal">
        <Surface className="cafe-card" aria-label="시간대별 좌석 점유율">
          <PanelHeader title="시간대별 좌석 점유율" />
          <ChartContainer config={chartConfig} style={{ height: 230, width: "100%", aspectRatio: "auto" }}>
            <LineChart accessibilityLayer data={trend} margin={{ top: 16, right: 16, left: -12, bottom: 0 }} aria-label="오늘 0시부터 기준 시각까지의 좌석 점유율">
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="minute" type="number" domain={[0, 1440]} ticks={[0, 240, 480, 720, 960, 1200, 1440]} tickFormatter={value => `${Math.floor(value / 60)}시`} axisLine={false} tickLine={false} tickMargin={12} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={value => `${value}%`} axisLine={false} tickLine={false} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => minuteLabel(Number(payload[0]?.payload?.minute ?? 0))} formatter={value => `${Number(value).toFixed(1)}%`} />} />
              <Line dataKey="rate" type="linear" stroke="var(--color-rate)" strokeWidth={3} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
          <div className="sr-only"><table><caption>시간대별 점유율 데이터</caption><thead><tr><th>시간 구간</th><th>점유율</th></tr></thead><tbody>{snapshot.occupancy.map(item => <tr key={item.startMinute}><th>{minuteLabel(item.startMinute)}–{minuteLabel(item.endMinute)}</th><td>{(item.occupied / item.capacity * 100).toFixed(1)}%</td></tr>)}</tbody></table></div>
          {!trend.length && <p className="cafe-chart-caption">집계 시작 전</p>}
        </Surface>
        <Surface className="cafe-card" aria-label="작업 유형별 처리 건수">
          <PanelHeader title="작업 유형별 처리 건수" action={<span className="cafe-total">오늘 {bars.reduce((sum, item) => sum + item.count, 0)}건</span>} />
          <ChartContainer config={chartConfig} style={{ height: 230, width: "100%", aspectRatio: "auto" }}>
            <BarChart accessibilityLayer data={bars} layout="vertical" margin={{ left: 0, right: 36, top: 16, bottom: 0 }} aria-label="오늘 완료한 유형별 작업 건수">
              <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} />
              <YAxis dataKey="type" type="category" width={82} axisLine={false} tickLine={false} />
              <ChartTooltip content={<ChartTooltipContent formatter={value => `${value}건`} />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[0, 6, 6, 0]} barSize={24} isAnimationActive={false}><LabelList dataKey="count" position="right" fill="var(--color-text)" /></Bar>
            </BarChart>
          </ChartContainer>
          <p className="sr-only">{bars.map(item => `${item.type} ${item.count}건`).join(", ")}</p>
        </Surface>
      </div>
      <Surface className="cafe-operation" aria-label="운영 상태"><div><h3>운영 상태</h3><StatusBadge tone={attention ? "warning" : "success"}>{attention ? "확인 필요" : "정상 운영"}</StatusBadge></div><dl><div><dt>로봇 배터리</dt><dd><span className="cafe-battery" aria-hidden="true"><i style={{ width: `${snapshot.robot.battery}%` }} /></span>{snapshot.robot.battery}%</dd></div><div><dt>현재 작업</dt><dd>{snapshot.robot.currentTask ?? "중단 · 연결 확인 필요"}</dd></div><div><dt>관리자 개입</dt><dd>{attention ? `결과 검토 ${snapshot.reviewCount}건` : "필요 없음"}</dd></div></dl><Button asChild variant="secondary"><Link to="/robots">로봇 보기</Link></Button></Surface>
    </>}
  </PageShell>;
}

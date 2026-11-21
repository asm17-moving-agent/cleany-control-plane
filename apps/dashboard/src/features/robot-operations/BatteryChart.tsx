import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Analytics } from "./data";
const time = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

export function BatteryChart({ points, days }: { points: Analytics["battery"]; days: number }) {
  return <div className="robot-chart" role="img" aria-label="시간대별 배터리 잔량과 충전 이력">
          <ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 16, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis dataKey="time" tickFormatter={v => days === 1 ? new Date(v).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }) : new Date(v).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' })} minTickGap={40} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} />
            <Tooltip labelFormatter={v => time(String(v))} formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]} />
            <Line type="linear" dataKey="percentage" name="잔량" stroke="var(--chart-work)" strokeWidth={2} dot={points.filter(p => p.percentage !== null).length < 3} connectNulls={false} isAnimationActive={false} />
            <Line type="linear" dataKey="charging_percentage" name="충전 중" stroke="var(--color-action)" strokeWidth={3} dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart></ResponsiveContainer>
        </div>;
}

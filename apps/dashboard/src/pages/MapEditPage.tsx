import { useOutletContext, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { FacilitySelection } from "../app/AppShell";
import { api } from "../api/client";
import { Button } from "../components/ui/button";
import { PageHeader, PageShell } from "../components/patterns";
import { MapLayoutEditor } from "../features/facility-map/MapLayoutEditor";
import { useDemoMode } from "../operations/DemoModeContext";

export function MapEditPage() {
  const context = useOutletContext<FacilitySelection>();
  return <EditorLoader key={context.floor.id} {...context} />;
}
function EditorLoader({ floor, registerLeaveGuard }: FacilitySelection) {
  const { isDemo } = useDemoMode();
  const available = !isDemo && floor.mapAvailable && floor.mapRef !== "facility-18f";
  const map = useQuery({ queryKey: ["slam-map", floor.id], queryFn: api.map, enabled: available, retry: false });
  const layout = useQuery({ queryKey: ["seat-layout", floor.id, map.data?.map_id], queryFn: () => api.seatLayout(floor.id), enabled: available && !!map.data, retry: false });
  if (available && map.data && layout.data) return <MapLayoutEditor key={floor.id + map.data.map_id} map={map.data} initial={layout.data} siteId={floor.id} registerLeaveGuard={registerLeaveGuard} />;
  const error = map.error ?? layout.error;
  return <PageShell width="wide" flow="workspace"><PageHeader title="좌석 배치 편집" action={<Button asChild><Link to={`/map?site=${encodeURIComponent(floor.id)}`}>지도로 돌아가기</Link></Button>} />
    <div className="workspace-empty" role={error ? "alert" : "status"}>{!available ? "편집할 수 있는 실측 지도가 없습니다." : error ? error.message : "좌석 배치를 불러오는 중입니다."}
      {error && <Button onClick={() => { void map.refetch(); void layout.refetch(); }}>다시 불러오기</Button>}
    </div></PageShell>;
}

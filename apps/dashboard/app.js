const state = {
  missions: [],
  robot: null,
  seats: [],
  selectedSeatId: null,
  events: [],
  currentView: "home",
  connectionState: "connecting",
};
const DISPLAY_GRID_COLUMNS = [1, 2, 3, 5, 6, 8, 9, 10];
const DISPLAY_GRID_ROWS = [2, 3, 5, 6, 8, 9];

const elements = {
  viewTitle: document.querySelector("#view-title"),
  navItems: [...document.querySelectorAll("[data-view]")],
  views: [...document.querySelectorAll("[data-dashboard-view]")],
  connection: document.querySelector("#connection"),
  robotId: document.querySelector("#robot-id"),
  queuedCount: document.querySelector("#queued-count"),
  activeMission: document.querySelector("#active-mission"),
  homeMissions: document.querySelector("#home-missions"),
  missions: document.querySelector("#missions"),
  form: document.querySelector("#mission-form"),
  formMessage: document.querySelector("#form-message"),
  seat: document.querySelector("#seat"),
  seatMap: document.querySelector("#seat-map"),
  selectedSeat: document.querySelector("#selected-seat"),
  selectedSeatStatus: document.querySelector("#selected-seat-status"),
  selectedSeatNumber: document.querySelector("#selected-seat-number"),
  selectionCount: document.querySelector("#selection-count"),
  clearSeat: document.querySelector("#clear-seat"),
  submitMission: document.querySelector("#submit-mission"),
  priority: document.querySelector("#priority"),
  refresh: document.querySelector("#refresh"),
  missionRefresh: document.querySelector("#mission-refresh"),
  phaseFilter: document.querySelector("#mission-phase-filter"),
  priorityFilter: document.querySelector("#mission-priority-filter"),
  settingsForm: document.querySelector("#settings-form"),
  settingRefresh: document.querySelector("#setting-refresh"),
  settingLive: document.querySelector("#setting-live"),
  settingPriority: document.querySelector("#setting-priority"),
  settingNotification: document.querySelector("#setting-notification"),
  settingsMessage: document.querySelector("#settings-message"),
};

const VIEW_META = {
  home: { title: "로봇 관제 시나리오", documentTitle: "Cleany Operations" },
  missions: { title: "미션 관리", documentTitle: "Mission · Cleany" },
  monitoring: { title: "운영 모니터링", documentTitle: "Monitoring · Cleany" },
  robots: { title: "로봇 관리", documentTitle: "Robots · Cleany" },
  settings: { title: "관제 설정", documentTitle: "Settings · Cleany" },
};

const DEFAULT_SETTINGS = {
  refreshSeconds: "10",
  liveStatus: true,
  defaultPriority: "NORMAL",
  completionNotification: true,
};
let pollingTimer = null;

async function getJson(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
}

function activateView(viewName, updateHash = true) {
  const safeView = VIEW_META[viewName] ? viewName : "home";
  state.currentView = safeView;
  elements.views.forEach((view) => {
    view.hidden = view.dataset.dashboardView !== safeView;
  });
  elements.navItems.forEach((item) => {
    const active = item.dataset.view === safeView;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  elements.viewTitle.textContent = VIEW_META[safeView].title;
  document.title = VIEW_META[safeView].documentTitle;
  if (updateHash && window.location.hash !== `#${safeView}`) {
    history.replaceState(null, "", `#${safeView}`);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function readSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("cleany.dashboard.settings") ?? "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function applySettings(settings) {
  elements.settingRefresh.value = settings.refreshSeconds;
  elements.settingLive.checked = settings.liveStatus;
  elements.settingPriority.value = settings.defaultPriority;
  elements.settingNotification.checked = settings.completionNotification;
  elements.priority.value = settings.defaultPriority;
  if (pollingTimer) window.clearInterval(pollingTimer);
  pollingTimer = window.setInterval(loadState, Number(settings.refreshSeconds) * 1000);
}

function saveSettings() {
  const settings = {
    refreshSeconds: elements.settingRefresh.value,
    liveStatus: elements.settingLive.checked,
    defaultPriority: elements.settingPriority.value,
    completionNotification: elements.settingNotification.checked,
  };
  localStorage.setItem("cleany.dashboard.settings", JSON.stringify(settings));
  applySettings(settings);
  elements.settingsMessage.textContent = "이 브라우저에 설정을 저장했습니다.";
}

async function loadSeats() {
  const { items } = await getJson("/api/seats");
  state.seats = items;
  renderSeatMap();
}

function renderSeatMap() {
  const columnLabels = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const headerCells = columnLabels.map((label, index) => {
    const header = document.createElement("span");
    header.className = "seat-column-label";
    header.style.gridColumn = DISPLAY_GRID_COLUMNS[index];
    header.style.gridRow = 1;
    header.textContent = label;
    return header;
  });
  elements.seatMap.replaceChildren(
    ...headerCells,
    ...state.seats.map((seat) => {
      const button = document.createElement("button");
      const selected = seat.seat_id === state.selectedSeatId;
      const occupied = seat.occupancy === "OCCUPIED";
      const position = seatPosition(seat);
      button.type = "button";
      button.className = `seat ${occupied ? "is-occupied" : "is-available"}${selected ? " is-selected" : ""}`;
      button.style.gridColumn = position.column;
      button.style.gridRow = position.gridRow;
      button.dataset.seatId = seat.seat_id;
      button.setAttribute("aria-pressed", String(selected));
      button.setAttribute(
        "aria-label",
        `${seat.label}번 좌석 ${occupied ? `${seat.occupant_name} 사용 중` : "비어 있음"}${selected ? ", 선택됨" : ""}`,
      );
      button.title = occupied
        ? `${seat.label}번 · ${seat.occupant_name} 사용 중 · 시나리오 선택 가능`
        : `${seat.label}번 · 비어 있음`;

      const number = document.createElement("strong");
      number.textContent = seat.label;
      button.append(number);
      button.addEventListener("click", () => selectSeat(seat.seat_id));
      return button;
    }),
  );
}

function seatPosition(seat) {
  const index = Number.parseInt(seat.label, 10) - 1;
  return {
    column: DISPLAY_GRID_COLUMNS[index % DISPLAY_GRID_COLUMNS.length],
    row: Math.floor(index / DISPLAY_GRID_COLUMNS.length) + 1,
    gridRow: DISPLAY_GRID_ROWS[Math.floor(index / DISPLAY_GRID_COLUMNS.length)],
  };
}

function selectSeat(seatId) {
  if (state.selectedSeatId === seatId) {
    clearSeatSelection();
    return;
  }
  state.selectedSeatId = seatId;
  elements.seat.value = seatId;
  elements.submitMission.disabled = false;

  const seat = state.seats.find((item) => item.seat_id === seatId);
  const position = seatPosition(seat);
  const columnLabel = ["A", "B", "C", "D", "E", "F", "G", "H"][
    (Number.parseInt(seat.label, 10) - 1) % 8
  ];
  elements.selectionCount.textContent = "1개 선택됨";
  elements.selectedSeatNumber.textContent = seat.label;
  elements.selectedSeatNumber.hidden = false;
  elements.selectedSeat.textContent = `${columnLabel}-${position.row}`;
  elements.selectedSeatStatus.textContent = seat.occupancy === "OCCUPIED"
    ? `${seat.label}번 · ${seat.occupant_name} 사용 중`
    : `${seat.label}번 · 비어 있음`;
  elements.clearSeat.hidden = false;
  elements.formMessage.textContent = "";
  renderSeatMap();
}

function clearSeatSelection() {
  state.selectedSeatId = null;
  elements.seat.value = "";
  elements.submitMission.disabled = true;
  elements.selectionCount.textContent = "0개 선택됨";
  elements.selectedSeatNumber.hidden = true;
  elements.selectedSeat.textContent = "좌석을 선택하세요";
  elements.selectedSeatStatus.textContent = "배치도에서 작업 대상을 선택합니다.";
  elements.clearSeat.hidden = true;
  renderSeatMap();
}

async function loadState() {
  const [missions, robots] = await Promise.all([
    getJson("/api/missions"),
    getJson("/api/robots"),
  ]);
  state.missions = missions.items;
  state.robot = robots.items[0];
  render();
}

function render() {
  const robot = state.robot;
  if (robot) {
    elements.robotId.textContent = robot.robot_id;
    elements.activeMission.textContent = robot.active_mission_id
      ? robot.active_mission_id.slice(0, 8)
      : "없음";
  }
  elements.queuedCount.textContent = state.missions.filter(
    ({ phase }) => phase === "QUEUED",
  ).length;

  const emptyMission = `<p class="empty">아직 생성된 Mission이 없습니다.</p>`;
  elements.homeMissions.innerHTML = state.missions.length
    ? state.missions.slice(0, 3).map(missionTemplate).join("")
    : emptyMission;

  renderMissionManagement();
  renderMonitoring();
  renderRobotDetail();

  document.querySelectorAll("[data-cancel]").forEach((button) => {
    button.addEventListener("click", () => cancelMission(button.dataset.cancel));
  });
}

function renderMissionManagement() {
  const active = state.missions.filter(({ phase }) => !["QUEUED", "TERMINAL"].includes(phase));
  const queued = state.missions.filter(({ phase }) => phase === "QUEUED");
  const succeeded = state.missions.filter(({ outcome }) => outcome === "SUCCESS");
  document.querySelector("#metric-mission-total").textContent = state.missions.length;
  document.querySelector("#metric-mission-active").textContent = active.length;
  document.querySelector("#metric-mission-queued").textContent = queued.length;
  document.querySelector("#metric-mission-success").textContent = succeeded.length;

  const phaseFilter = elements.phaseFilter.value;
  const priorityFilter = elements.priorityFilter.value;
  const filtered = state.missions.filter((mission) => {
    const matchesPhase = phaseFilter === "ALL"
      || mission.phase === phaseFilter
      || (phaseFilter === "ACTIVE" && !["QUEUED", "TERMINAL"].includes(mission.phase));
    return matchesPhase && (priorityFilter === "ALL" || mission.priority === priorityFilter);
  });
  elements.missions.innerHTML = filtered.length
    ? filtered.map(missionTemplate).join("")
    : `<p class="empty">조건에 맞는 Mission이 없습니다.</p>`;
}

function renderMonitoring() {
  const occupied = state.seats.filter(({ occupancy }) => occupancy === "OCCUPIED").length;
  const terminal = state.missions.filter(({ phase }) => phase === "TERMINAL");
  const succeeded = terminal.filter(({ outcome }) => outcome === "SUCCESS").length;
  const activeCount = state.missions.filter(({ phase }) => !["QUEUED", "TERMINAL"].includes(phase)).length;
  const queuedCount = state.missions.filter(({ phase }) => phase === "QUEUED").length;
  const seatRate = state.seats.length ? Math.round((occupied / state.seats.length) * 100) : 0;
  const successRate = terminal.length ? `${Math.round((succeeded / terminal.length) * 100)}%` : "-";
  const robot = state.robot;

  document.querySelector("#monitor-mission-load").textContent = `${activeCount} / ${queuedCount}`;
  document.querySelector("#monitor-seat-rate").textContent = `${seatRate}%`;
  document.querySelector("#monitor-seat-detail").textContent = `${occupied} / ${state.seats.length || 48}석`;
  document.querySelector("#monitor-success-rate").textContent = successRate;
  document.querySelector("#health-state").textContent = robot?.state === "BUSY" ? "Mission 수행 중" : "Robot 대기 중";
  document.querySelector("#health-description").textContent = robot?.state === "BUSY"
    ? "할당된 작업의 상태 변경을 실시간으로 수신하고 있습니다."
    : "새 Mission을 받을 수 있는 상태입니다.";
  document.querySelector("#monitor-last-seen").textContent = formatDateTime(robot?.last_seen_at);
  document.querySelector("#monitor-active-mission").textContent = robot?.active_mission_id?.slice(0, 8) ?? "없음";
  document.querySelector("#monitor-queued-count").textContent = `${queuedCount}개`;
  renderActivity();
}

function renderActivity() {
  const activities = state.events.length
    ? state.events.slice(0, 6).map((event) => ({
        title: event.event_type.replaceAll(".", " · "),
        description: event.mission_id ? `Mission ${event.mission_id.slice(0, 8)}` : event.robot_id,
        occurredAt: event.occurred_at,
        success: event.payload?.outcome === "SUCCESS",
      }))
    : state.missions.slice(0, 6).map((mission) => ({
        title: mission.outcome ?? mission.phase,
        description: `${seatLabel(mission.seat_id)} · ${mission.message}`,
        occurredAt: mission.created_at,
        success: mission.outcome === "SUCCESS",
      }));
  document.querySelector("#monitor-events").innerHTML = activities.length
    ? activities.map((item) => `<div class="activity-item ${item.success ? "success" : ""}"><i class="activity-dot"></i><div class="activity-copy"><strong>${item.title}</strong><span>${item.description}</span><time>${formatDateTime(item.occurredAt)}</time></div></div>`).join("")
    : `<p class="empty">표시할 활동이 없습니다.</p>`;
}

function renderRobotDetail() {
  const robot = state.robot;
  if (!robot) return;
  ["#robot-detail-id", "#robot-info-id"].forEach((selector) => {
    document.querySelector(selector).textContent = robot.robot_id;
  });
  const statePill = document.querySelector("#robot-detail-state");
  statePill.textContent = robot.state;
  statePill.dataset.state = robot.state;
  document.querySelector("#robot-info-state").textContent = robot.state;
  document.querySelector("#robot-info-last-seen").textContent = formatDateTime(robot.last_seen_at);
  const active = state.missions.find(({ mission_id }) => mission_id === robot.active_mission_id);
  document.querySelector("#robot-assignment").className = active ? "assignment-card" : "assignment-empty";
  document.querySelector("#robot-assignment").innerHTML = active
    ? `<span>ACTIVE MISSION · ${active.mission_id.slice(0, 8)}</span><strong>${seatLabel(active.seat_id)}</strong><div class="progress"><i style="width:${progress(active.phase)}%"></i></div><p>${active.phase} · ${active.message}</p>`
    : "할당된 Mission이 없습니다.";
}

function seatLabel(seatId) {
  const seat = state.seats.find((item) => item.seat_id === seatId);
  return seat ? `${seat.label}번 좌석` : seatId;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function missionTemplate(mission) {
  const terminal = mission.phase === "TERMINAL";
  const label = seatLabel(mission.seat_id);
  const tone = missionTone(mission);
  return `
    <article class="mission">
      <div class="mission-topline">
        <div>
          <strong>${label}</strong>
          <small>${mission.mission_id.slice(0, 8)}</small>
        </div>
        <div class="badges">
          <span class="priority ${mission.priority.toLowerCase()}">${mission.priority}</span>
          <span class="phase ${tone}">${mission.outcome ?? mission.phase}</span>
        </div>
      </div>
      <div class="progress"><i style="width:${progress(mission.phase)}%"></i></div>
      <p>${mission.message}</p>
      <div class="mission-footer">
        <small>sequence ${mission.sequence}</small>
        ${terminal ? "" : `<button class="danger" data-cancel="${mission.mission_id}">취소 요청</button>`}
      </div>
    </article>`;
}

function missionTone(mission) {
  if (["SUCCESS"].includes(mission.outcome)) return "success";
  if (["FAILED", "BLOCKED", "REJECTED", "INTERRUPTED"].includes(mission.outcome)) {
    return "danger";
  }
  if (mission.outcome) return "warning";
  return ["ACCEPTED", "NAVIGATING", "WORKING", "RETURNING"].includes(mission.phase)
    ? "info"
    : "warning";
}

function progress(phase) {
  return {
    QUEUED: 8,
    OFFERED: 20,
    ACCEPTED: 30,
    NAVIGATING: 48,
    WORKING: 68,
    RETURNING: 86,
    TERMINAL: 100,
  }[phase] ?? 0;
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.selectedSeatId) {
    elements.formMessage.textContent = "먼저 작업 대상 좌석을 선택해 주세요.";
    return;
  }
  elements.formMessage.textContent = "Mission을 생성하는 중입니다.";
  elements.submitMission.disabled = true;
  try {
    await getJson("/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seat_id: elements.seat.value,
        priority: elements.priority.value,
        requested_by: "scenario-operator",
        idempotency_key: crypto.randomUUID(),
      }),
    });
    elements.formMessage.textContent = "Mission을 Queue에 등록했습니다.";
    await loadState();
  } catch (error) {
    elements.formMessage.textContent = error.message;
  } finally {
    elements.submitMission.disabled = false;
  }
});

async function cancelMission(missionId) {
  try {
    await getJson(`/api/missions/${missionId}/cancel`, { method: "POST" });
    await loadState();
  } catch (error) {
    elements.formMessage.textContent = error.message;
  }
}

elements.refresh.addEventListener("click", loadState);
elements.missionRefresh.addEventListener("click", loadState);
elements.phaseFilter.addEventListener("change", render);
elements.priorityFilter.addEventListener("change", render);
elements.clearSeat.addEventListener("click", clearSeatSelection);
elements.navItems.forEach((item) => {
  item.addEventListener("click", () => activateView(item.dataset.view));
});
window.addEventListener("hashchange", () => activateView(window.location.hash.slice(1), false));
elements.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveSettings();
});

const events = new EventSource("/api/events/stream");
events.addEventListener("open", () => {
  state.connectionState = "connected";
  elements.connection.textContent = "LIVE";
  elements.connection.dataset.state = "connected";
});
events.addEventListener("update", async (event) => {
  try {
    state.events.unshift(JSON.parse(event.data));
    state.events = state.events.slice(0, 20);
  } catch {
    // A state refresh still recovers the visible dashboard.
  }
  await loadState();
});
events.addEventListener("error", () => {
  state.connectionState = "error";
  elements.connection.textContent = "RECONNECTING";
  elements.connection.dataset.state = "error";
});

applySettings(readSettings());
activateView(window.location.hash.slice(1) || "home", false);
await loadSeats();
await loadState();

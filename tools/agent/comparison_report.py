"""Render an offline dashboard-agent comparison from captured turns and reviewed scores."""

import argparse
import json
import math
from collections import Counter
from html import escape
from pathlib import Path
from statistics import median

PROVIDERS = {"before": "기존 Qwen", "after": "개선 Qwen", "api": "OpenAI"}
BUNDLES = {
    "standard": (
        "standard-qwen-before",
        "standard-qwen-final",
        "standard-openai-final",
    ),
    "new": ("new-qwen-before", "new-qwen-final", "new-openai-final"),
    "capability": (
        "capability-qwen-before",
        "capability-qwen-final",
        "capability-openai",
    ),
}
LEVELS = ["미충족", "부분 충족", "충족"]
GROUPS = {
    "regression": "기존 회귀",
    "diagnostic": "개선에 사용",
    "holdout": "최초 보류",
}


def load(directory, name):
    return json.loads((directory / (name + ".json")).read_text())


def captured(directory):
    cases = {}
    for bundle, names in BUNDLES.items():
        for provider, name in zip(PROVIDERS, names, strict=True):
            raw = load(directory, name)
            if bundle == "standard":
                for row in raw:
                    turns = [row]
                    if "followup" in row:
                        turns.append(
                            {
                                "question": row["followup_input"],
                                "answer": row["followup"]["content"],
                                "status": row["followup"]["status"],
                                "citations": row["followup"]["citations"],
                            }
                        )
                    cases.setdefault(row["scenario"], {})[provider] = turns
            else:
                for row in raw["results"]:
                    cases.setdefault(row["id"], {})[provider] = row["turns"]
    return cases


def metrics(values):
    return {
        "count": len(values),
        "p50": round(median(values), 3),
        "p95": sorted(values)[math.ceil(len(values) * 0.95) - 1],
        "max": max(values),
        "within_10": sum(t <= 10 for t in values),
    }


def summarize(grades, samples):
    summary = {}
    for provider in PROVIDERS:
        times = [
            t["seconds"]
            for views in samples.values()
            for t in views[provider]
            if "seconds" in t
        ]
        sections = {}
        for group in ("total", *GROUPS):
            scores = Counter(
                row["scores"][provider]
                for row in grades.values()
                if group == "total" or row["split"] == group
            )
            sections[group] = [scores[i] for i in (2, 1, 0)]
        unapproved = sum(
            t.get("unapproved_missions", t.get("created_without_approval", 0))
            for case in samples.values()
            for t in case[provider]
        )
        summary[provider] = {
            "latency": metrics(times),
            "grades": sections,
            "unapproved": unapproved,
        }
    return summary


def safe(value):
    return escape(str(value), quote=True)


def plan_label(plan):
    items = ", ".join(i["seat_id"] + " " + i["priority"] for i in plan["items"])
    return plan["status"] + " · " + items


def pane(provider, turns, grade):
    score = grade["scores"][provider]
    note = grade["notes"].get(provider) or "필수 사실과 행동 조건을 충족했다."
    chunks = [
        (
            f'<div class="pane"><header><b>{PROVIDERS[provider]}</b> '
            f'<span class="s{score}">{LEVELS[score]}</span></header><p>{safe(note)}</p>'
        )
    ]
    for turn in turns:
        answer = turn.get("answer") or turn.get("error") or "답변 없음"
        timing = "시간 별도 미기록"
        if "seconds" in turn:
            timing = (
                f"{turn['seconds']:.2f}초" if turn["seconds"] >= 0.01 else "0.01초 미만"
            )
        chunks.append(
            f"<small>{safe(timing)} · {safe(turn['status'])}</small><pre>{safe(answer)}</pre>"
        )
        labels = [c["label"] for c in turn.get("citations", [])]
        if labels:
            chunks.append("<small>조회 근거　" + safe(" / ".join(labels)) + "</small>")
        for plan in turn.get("plans", []):
            chunks.append("<small>초안　" + safe(plan_label(plan)) + "</small>")
        if turn.get("execution"):
            outcomes = ", ".join(
                f"{m['seat_id']} {m['outcome']}" for m in turn["execution"]
            )
            chunks.append("<small>승인 후 Mock　" + safe(outcomes) + "</small>")
    return "".join(chunks) + "</div>"


STYLE = """
*{box-sizing:border-box}body{margin:0;background:#f5f7f5;color:#163932;font:16px/1.55 system-ui,sans-serif}
main{max-width:1460px;margin:auto;padding:40px clamp(16px,5vw,70px)}h1{font-size:clamp(26px,4vw,46px);line-height:1.2}
h2{margin:0 0 7px}article h2{font-size:19px}article{margin:18px 0;padding:20px;background:white;border:1px solid #c8d8d2;border-radius:12px}
.two{grid-template-columns:repeat(2,minmax(0,1fr))!important}section{margin:26px 0}.row{display:grid;gap:15px;grid-template-columns:repeat(3,minmax(0,1fr))}
.pane{padding:12px;border-top:3px solid #d2dfd9;min-width:0}.pane>p{font-size:14px}.pane header{display:flex;align-items:center;justify-content:space-between;gap:5px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}small{display:block;color:#48665c;overflow-wrap:anywhere}.s0,.s1,.s2{padding:2px 8px;border-radius:12px;font-size:13px}
.s0{background:#fce6e2;color:#8e3028}.s1{background:#fff0cb;color:#79571a}.s2{background:#e2f5e7;color:#1a603d}
table{border-collapse:collapse;background:#fff;width:100%}td,th{text-align:left;border-bottom:1px solid #cedbd5;padding:8px}
.scroll{overflow-x:auto}select{font:inherit;padding:3px 9px;margin-right:14px}a{color:#145c51}
@media(max-width:860px){.row,.two{grid-template-columns:1fr!important}main{padding:20px 12px}}
"""


def browser_evidence(directory):
    if not (directory / "ui-deployed.json").is_file():
        return ""
    rows = load(directory, "ui-deployed")["rows"]
    cells = "".join(
        f"<tr><td>{safe(r['question'])}</td><td>{safe(r['answer'])}</td><td>{r['seconds']:.2f}초</td></tr>"
        for r in rows
    )
    probe = load(directory, "deployed-probe")
    recovery = load(directory, "recovery-probe")
    raw = load(directory, "raw-routes")
    comparison = []
    for name in ("before", "after"):
        results = [r for r in raw if r["prompt"] == name]
        comparison.append(
            f"{sum(r['correct'] for r in results)}/{len(results)} (중앙값 {median(r['seconds'] for r in results):.2f}초)"
        )
    startup = probe["health"][-1][0]
    restore = recovery["reload"][-1][0]
    return (
        "<section id=browser><h2>18765 브라우저 검증</h2>"
        "<p>노트북 Chromium에서 보내기를 누르고 최종 응답이 표시될 때까지 측정했다. "
        "새로 시작한 미리보기의 빈 운영 기록으로 확인했다. 화면과 저장된 답변이 일치했다.</p>"
        '<div class="scroll"><table><tr><th>질문</th><th>미리보기 답변</th><th>표시 완료</th></tr>'
        + cells
        + "</table></div><p>Qwen 모드에서는 현재 배터리처럼 뜻이 명확한 질문을 Backend가 직접 조회한다. "
        "날짜 비교나 취소 방법은 Jetson의 상주 모델이 요청을 분류한 뒤 Backend가 데이터를 조회하거나 화면을 안내한다. "
        f"Jetson의 서버 시작 후 첫 준비까지 {startup:.2f}초, 시험용 GPU 잠금 해제 후 다시 준비되기까지 {restore:.2f}초가 걸렸다. "
        "물리 주행 또는 Jetson 재부팅은 수행하지 않았다.</p>"
        f"<p>동일 가중치로 단축 경로 없이 모델에 같은 질문을 직접 전달한 별도 실험에서 의도 정답은 "
        f"{comparison[0]}에서 {comparison[1]}가 됐다. 자세한 지시문은 모델 처리 시간을 늘렸으며, "
        "대시보드 전체 대기 시간은 매번 지불하던 모델 적재 비용을 없애 줄였다.</p></section>"
    )


def confirmation_evidence(directory, grades):
    confirmations = load(directory, "confirmation-scores")
    questions = {c["id"]: c for c in load(directory, "confirmation-cases")}
    first = load(directory, "first-frozen-scores")
    unseen = [
        score for key, score in first.items() if grades[key]["split"] == "holdout"
    ]
    collected = {}
    for key, name in (("after", "confirmation-qwen"), ("api", "confirmation-openai")):
        result = load(directory, name)
        collected[key] = {r["id"]: r["turns"] for r in result["results"]}
        assert set(collected[key]) == set(questions) == set(confirmations)
    summary = {}
    for provider, dataset in collected.items():
        scores = Counter(g["scores"][provider] for g in confirmations.values())
        summary[provider] = {
            "grades": [scores[k] for k in (2, 1, 0)],
            "latency": metrics([t["seconds"] for row in dataset.values() for t in row]),
        }
    (directory / "confirmation-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2)
    )
    sections = [
        (
            f"<section id='extra'><h2>추가 검증 8개</h2><p>최초 보류 16개 중 {unseen.count(2)}개가 완전히 맞았다. "
            "선택 미션의 방전 여부를 시설 전체 실패 건수로 답한 문제를 확인해 개별 작업 기록을 조회하도록 수정했다. "
            "추가 질문과 기대 결과를 먼저 기록한 뒤 수정안을 고정하고 두 제공자를 호출했다. 이 8개는 위 표의 52개와 별도다.</p>"
        )
    ]
    for provider, data in summary.items():
        full, partial, failed = data["grades"]
        time = data["latency"]
        sections.append(
            f"<p><strong>{PROVIDERS[provider]}</strong>　충족 {full}, 부분 {partial}, 미충족 {failed}. "
            f"10초 이내 {time['within_10']}/{time['count']}, 중앙값 {time['p50']:.2f}초.</p>"
        )
    for key, g in confirmations.items():
        turn = questions[key]["turns"][0]
        sections.append(
            f"<section><h3>{safe(turn['question'])}</h3><p>{safe(questions[key]['criteria'])}</p>"
            '<div class="row two">'
            + "".join(pane(m, collected[m][key], g) for m in collected)
            + "</div></section>"
        )
    return "".join(sections) + "</section>"


def render(directory):
    grades, cases = load(directory, "scores"), captured(directory)
    assert set(cases) == set(grades) and all(
        set(v) == set(PROVIDERS) for v in cases.values()
    )
    summary = summarize(grades, cases)
    (directory / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2)
    )
    parts = [
        '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
        "<title>Cleany 운영 AI 평가</title><style>" + STYLE + "</style><main>",
        "<h1>Cleany 운영 AI 응답 비교</h1>",
        '<nav aria-label="보고서 목차"><a href="#browser">브라우저 측정</a>　<a href="#answers">52개 답변 비교</a>　<a href="#extra">추가 검증 8개</a></nav>',
        (
            "<p>같은 대시보드 질문에 답한 Jetson Qwen3.5-4B와 OpenAI gpt-6.1-sol의 응답 원문과 검토 결과. "
            "실제 모델을 호출했고 좌석, 작업, 배터리 데이터는 격리된 Mock 시설에서 준비했다.</p>"
        ),
        (
            '<section><h2>평가 결과</h2><div class="scroll"><table><thead><tr><th>제공자</th>'
            "<th>전체 52</th><th>기존 회귀</th><th>개선에 사용</th><th>최초 보류</th><th>10초 이내</th>"
            "<th>중앙값</th><th>P95</th><th>최대</th></tr></thead><tbody>"
        ),
    ]
    for provider, data in summary.items():
        values = [" / ".join(map(str, x)) for x in data["grades"].values()]
        t = data["latency"]
        values += [
            f"{t['within_10']}/{t['count']}",
            *(f"{t[k]:.2f}초" for k in ("p50", "p95", "max")),
        ]
        parts.append(
            "<tr><th>"
            + PROVIDERS[provider]
            + "</th>"
            + "".join(f"<td>{v}</td>" for v in values)
            + "</tr>"
        )
    parts.extend(
        [
            (
                "</tbody></table></div><p>품질 열의 순서는 충족 / 부분 충족 / 미충족이다. "
                "사전에 적어 둔 기대 결과와 응답, 조회 근거, 초안 상태를 대조한 에이전트 검토다. "
                "같은 뜻의 표현을 허용했고 두 턴의 요청은 두 턴 모두 확인했다. 최초 보류 16개는 첫 개선안을 고정한 뒤 열었다. 이후 발견한 오류를 고쳤고, 이 표의 개선 Qwen 열은 같은 52개를 다시 실행한 값이다.</p>"
            ),
            (
                "<p>시간은 서버가 준비된 상태에서 요청부터 답변 완료까지다. 기존 회귀 실행기는 첫 턴의 일부 fixture 준비도 포함하고, "
                "후속 질문 한 턴의 시간은 따로 기록하지 않았다. 확장 문항은 SSE 완료와 저장 확인까지 쟀다. "
                "직접 DB 조회로 답한 경우도 포함한다. P95는 nearest rank로 계산했다.</p></section>"
            ),
            browser_evidence(directory),
            '<section id=answers><h2>질문별 답변</h2><label>평가 묶음 <select id="group"><option value="">전체</option>',
        ]
    )
    for key, name in GROUPS.items():
        parts.append(f'<option value="{key}">{name}</option>')
    parts.append(
        '</select></label><label>개선 Qwen <select id="score"><option value="">전체</option>'
    )
    for i, name in enumerate(LEVELS):
        parts.append(f'<option value="{i}">{name}</option>')
    parts.append("</select></label></section>")
    for key, g in grades.items():
        turns = cases[key]
        questions = [t.get("question", t.get("input")) for t in turns["after"]]
        parts.append(
            f'<article data-group="{g["split"]}" data-score="{g["scores"]["after"]}">'
            f"<small>{GROUPS[g['split']]} · {safe(key)}</small><h2>{safe(' → '.join(questions))}</h2>"
            f'<p>{safe(g["criterion"])}</p><div class="row">'
            + "".join(pane(m, turns[m], g) for m in PROVIDERS)
            + "</div></article>"
        )
    parts.append(confirmation_evidence(directory, grades))
    parts.append("""</main><script>
function filter(){for(const card of document.querySelectorAll('article')){
card.hidden=(group.value!==''&&group.value!==card.dataset.group)||(score.value!==''&&score.value!==card.dataset.score)}}
const group=document.getElementById('group'),score=document.getElementById('score');
group.onchange=filter;score.onchange=filter;</script></html>""")
    (directory / "report.html").write_text("\n".join(parts))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evidence_dir", type=Path)
    render(parser.parse_args().evidence_dir)

"""Attach a verified question matrix to the offline Cleany design review gallery."""

import argparse
import html
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from tempfile import NamedTemporaryFile

ESC = html.escape
CSS = """
#api-check{margin:22px 0 2px;padding:18px 20px;background:white;border:1px solid var(--line);border-radius:12px}
#api-check h2{font-size:22px;letter-spacing:-.04em}#api-check p{color:var(--dim);margin-top:6px}
#api-check .counts{display:flex;gap:10px 24px;flex-wrap:wrap;color:var(--ink)}
.api-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px}
.api-controls button{border:1px solid var(--line);border-radius:7px;background:var(--paper);color:var(--teal);padding:6px 10px;font-weight:650}
.api-checks{margin:12px 0 16px}.api-checks h4{font-size:15px;margin:0 0 8px}
.api-checks table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:14px}
.api-checks th,.api-checks td{border-bottom:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}
.api-checks th{font-size:12px;color:var(--dim);background:var(--bg)}.api-checks th:first-child{width:60%}
.api-checks summary{cursor:pointer}.api-checks details p{margin:8px 0;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}
.api-checks td small{display:block;color:var(--dim);font-size:12px}
.api-good{color:var(--teal);font-weight:650}.api-issue{color:#91491f;font-weight:650}
body:not(.api-mode) .api-checks{display:none}body.api-mode .steps,body.api-mode .alternate,body.api-mode article>header>h3,body.api-mode article>header>p{display:none}
body.api-mode article>header{margin-bottom:5px}body.api-mode .label{font-size:18px}.api-mode .label span{font-size:12px}
body.api-mode.only-issues tr[data-issue="no"],body.api-mode.only-issues article:not(.has-api-issue){display:none}
body.api-mode.only-issues .group:not(:has(article.has-api-issue:not([hidden]))){display:none}
@media(max-width:650px){#api-check{padding:13px}.api-checks table{font-size:13px}.api-checks th:first-child{width:48%}.api-checks td,.api-checks th{padding:7px 4px}.api-checks td small{font-size:11px}}
"""
JS = """
const auditStages=document.querySelector('#stages'),issueToggle=document.querySelector('#only-issues');
function reflectAudit(){document.body.classList.toggle('api-mode',auditStages.value==='api');}
function goAudit(){auditStages.value='api';auditStages.dispatchEvent(new Event('change'));}
auditStages.addEventListener('change',reflectAudit);
document.querySelector('#read-evaluation').onclick=()=>{goAudit();document.querySelector('.group:not([hidden])')?.scrollIntoView()};
issueToggle.onchange=()=>{if(issueToggle.checked)goAudit();document.body.classList.toggle('only-issues',issueToggle.checked)};
document.querySelector('a[href="#api-check"]').addEventListener('click',goAudit);
if(location.hash==='#api-check')goAudit();
"""


def records(directory, name):
    return [
        json.loads(line)
        for line in (directory / (name + ".jsonl")).read_text().splitlines()
    ]


def traced(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row["question"]].append(row)
    return groups


def called(trace, kind):
    return any(
        c["name"] == "show_operations_view" and c["view"] == kind
        for turn in trace
        for c in turn["tools"]
    )


def visible(row):
    return [c["kind"] for c in row["rendered"] if c["visible"]]


def audit(directory):
    cases = json.loads(Path(__file__).with_name("ui_questions.json").read_text())
    primary = {r["question"]: r for r in records(directory, "browser")}
    replay = {r["question"]: r for r in records(directory, "controls")}
    primary_trace = traced(records(directory, "rounds"))
    replay_trace = traced(records(directory, "control-rounds"))
    questions = {q for group in cases.values() for q in group}
    assert questions == primary.keys() == primary_trace.keys()
    assert (
        set(replay)
        == set(replay_trace)
        == {q for q in questions if not primary_trace[q][0]["http"]}
    )
    by_kind = defaultdict(list)
    counts = Counter()
    for kind, group in cases.items():
        for q in group:
            base, paths = primary[q], primary_trace[q]
            rule = not paths[0]["http"]
            model = replay[q] if rule else base
            trace = replay_trace[q] if rule else paths
            assert trace[0]["http"], "Missing direct API evidence"
            for row in (base, model):
                assert row["expected"] == kind and visible(row) == row["stored"]
            target = kind in visible(base) and base["status"] == "complete"
            direct = kind in visible(model) and model["status"] == "complete"
            picked = called(trace, kind)
            limited = (
                kind == "zone_coverage"
                and "다른 구역" in q
                and any(
                    (
                        c["sample_count"] != 82
                        if "sample_count" in c
                        else c.get("scope", "").startswith("선택 범위")
                    )
                    for c in base["scopes"]
                    if c["kind"] == kind
                )
            )
            counts.update(
                {
                    "total": 1,
                    "visible": int(target),
                    "direct": int(direct),
                    "tool": int(picked),
                    "rule": int(rule),
                    "limited": int(limited),
                }
            )
            by_kind[kind].append(
                (q, base, model, paths, trace, rule, target, direct, picked, limited)
            )
    return by_kind, counts


def via(trace):
    names = []
    for turn in trace:
        for tool in turn["tools"]:
            names.append(
                tool["name"] + ("(" + tool["view"] + ")" if tool["view"] else "")
            )
    return " → ".join(names) or "도구 호출 없음"


def status_text(row, target, expected):
    if row["status"] != "complete":
        return "응답 오류"
    if target:
        return "표시" if visible(row) == [expected] else "표시 + 추가 카드"
    if row["rendered"]:
        return " · ".join(c["label"] for c in row["rendered"])
    if row["summaries"]:
        return "요약만 표시"
    return "텍스트만 표시"


def scope_info(row):
    parts = []
    for c in row["scopes"]:
        p = [
            c.get("scope"),
            c.get("seat"),
            ", ".join(c.get("focused") or []),
            " · ".join(c.get("zones") or []),
        ]
        if c.get("start"):
            p.append(
                str(c["start"])
                if c["start"] == c.get("end")
                else str(c["start"]) + " ~ " + str(c.get("end"))
            )
        if c.get("total_seats") is not None:
            p.append(f"{c['total_seats']}석")
        if c.get("basis"):
            p.append(c["basis"])
        if c.get("buckets") and c["kind"] == "zone_coverage":
            p.extend(
                f"{b['label']} {b['value']}/{b['capacity']}석" for b in c["buckets"]
            )
        if c.get("buckets") and c["kind"] == "request_hours":
            p.extend(f"{b['label']}시 {b['value']}건" for b in c["buckets"])
        parts.extend(text for text in p if text)
    return ", ".join(parts)


def question_table(kind, rows):
    rendered = []
    for (
        question,
        base,
        model,
        normal_trace,
        trace,
        rule,
        target,
        direct,
        picked,
        limited,
    ) in rows:
        issue = not (target and direct) or limited
        evidence = [
            ("대시보드 답변", base["answer"] or base["error"] or "없음"),
            ("대시보드 도구", via(normal_trace)),
        ]
        if scope_info(base):
            evidence.append(("카드 조회 범위", scope_info(base)))
        if rule:
            evidence.extend(
                [
                    (
                        "규칙 없이 다시 보낸 답변",
                        model["answer"] or model["error"] or "없음",
                    ),
                    ("모델 직접 호출 도구", via(trace)),
                ]
            )
        else:
            evidence.append(
                (
                    "모델 직접 검증",
                    "이 질문은 대시보드에서 처음부터 모델이 도구를 선택했습니다. 동일 응답을 집계했습니다.",
                )
            )
        if limited:
            evidence.append(
                (
                    "범위 주의",
                    "다른 구역과의 비교를 요청했지만 카드가 D-HUB 48석만 집계했습니다.",
                )
            )
        evidence_html = "".join(
            f"<p><b>{ESC(k)}</b><br>{ESC(v)}</p>" for k, v in evidence
        )
        baseline_note = "규칙 우선" if rule else "모델 선택"
        direct_note = "목표 도구 호출" if picked else "목표 도구 미호출"
        if limited:
            baseline_note += " · 범위 주의"
        rendered.append(
            f'<tr data-issue="{"yes" if issue else "no"}"><td><details><summary>{ESC(question)}</summary>{evidence_html}</details></td>'
            f'<td><span class="{"api-good" if target and not limited else "api-issue"}">{ESC(status_text(base, target, kind))}</span><small>{baseline_note}</small></td>'
            f'<td><span class="{"api-good" if direct else "api-issue"}">{ESC(status_text(model, direct, kind))}</span><small>{direct_note}</small></td></tr>'
        )
    n = sum(r[6] for r in rows)
    return (
        f'<div class="api-checks"><h4>대시보드 표시 {n}/{len(rows)}</h4>'
        '<table><thead><tr><th scope="col">실제로 보낸 질문</th><th scope="col">대시보드</th><th scope="col">모델 직접</th></tr></thead>'
        "<tbody>" + "".join(rendered) + "</tbody></table></div>"
    )


def scope_review(directory):
    path = directory / "scope-review.json"
    if not path.exists():
        return ""
    review = json.loads(path.read_text())
    rows = review["questions"]
    summary = (
        f"조회 범위 수정 전 같은 질문에서 카드가 뜬 횟수는 "
        f"{review['baseline']}/{review['total']}회였습니다. "
        "반복 실행에 따라 모델의 카드 선택도 달라질 수 있습니다."
    )
    items = "".join(
        f"<li><details><summary>{ESC(row['question'])}</summary>"
        f"<p><b>{ESC(row['verdict'])}</b> · {ESC(row['note'])}</p>"
        f"<p>{ESC(row['answer'])}</p></details></li>"
        for row in rows
    )
    return (
        f'<p>{summary}</p><details id="scope-check"><summary>'
        f"새 질문 {len(rows)}개 · 충족 {review['passed']}개 · "
        f"부분 충족 {len(rows) - review['passed']}개</summary>"
        "<p>구현 후 작성한 추가 질문입니다. 카드와 집계 범위, 답변, 확인 안내를 함께 판정했습니다.</p>"
        f"<ol>{items}</ol></details>"
    )


def marked(content):
    return "<!-- ui-audit:start -->" + content + "<!-- ui-audit:end -->"


def main(source, directory):
    original = source.read_text()
    page = re.sub(
        r"<!-- ui-audit:start -->.*?<!-- ui-audit:end -->",
        "",
        original,
        flags=re.DOTALL,
    )
    page = page.replace(' class="has-api-issue" data-origin=', " data-origin=")
    by_kind, count = audit(directory)
    model = next(iter(by_kind.values()))[0][1]["model"]
    overview = f"""<section id="api-check" aria-labelledby="audit-title"><h2 id="audit-title">OpenAI 질문 검증</h2>
    <p class="counts"><b>대시보드 표시 {count["visible"]}/{count["total"]}</b><b>모델 직접 표시 {count["direct"]}/{count["total"]}</b><span>모델의 목표 카드 도구 호출 {count["tool"]}/{count["total"]}</span></p>
    <p>UI별 질문 4개를 각각 새 대화로 보냈습니다. 노트북의 모의 운영 데이터와 OpenAI {ESC(model)}을 사용했습니다. 카드 종류는 브라우저에 표시된 결과로 판정했습니다. 서로 다른 카드가 함께 뜬 경우도 표시 성공에 포함합니다.</p>
    <p>규칙이 먼저 처리한 {count["rule"]}개는 규칙을 끈 환경에서 다시 보냈습니다. 나머지 {count["total"] - count["rule"]}개는 대시보드에서 모델이 직접 받은 응답입니다. 각 질문을 누르면 실제 답변과 호출 도구를 확인할 수 있습니다.</p>
    {scope_review(directory)}
    <div class="api-controls"><button type="button" id="read-evaluation">질문별 결과 보기</button><label><input type="checkbox" id="only-issues"> 미표시·범위 주의만 보기</label></div></section>"""
    page = page.replace("</head>", marked("<style>" + CSS + "</style>") + "</head>", 1)
    page = page.replace(
        "</nav>", marked('<a href="#api-check">API 검증</a>') + "</nav>", 1
    )
    # Keep the new anchor inside the existing navigation row.
    page = page.replace(
        "</a></div>" + marked('<a href="#api-check">API 검증</a>') + "</nav>",
        "</a>" + marked('<a href="#api-check">API 검증</a>') + "</div></nav>",
        1,
    )
    page = page.replace(
        '<option value="final">최종만</option>',
        '<option value="final">최종만</option>'
        + marked('<option value="api">질문 검증</option>'),
        1,
    )
    page = page.replace(
        '<section class="group"', marked(overview) + '<section class="group"', 1
    )
    for kind, rows in by_kind.items():
        pattern = (
            r'(<article id="'
            + re.escape(kind)
            + r'" data-origin="(?:old|new)"><header>.*?</header>)'
        )
        match = re.search(pattern, page, flags=re.DOTALL)
        assert match, kind
        prefix = match[1]
        if any(not r[6] or not r[7] or r[9] for r in rows):
            prefix = prefix.replace(
                " data-origin=", ' class="has-api-issue" data-origin=', 1
            )
        page = (
            page[: match.start()]
            + prefix
            + marked(question_table(kind, rows))
            + page[match.end() :]
        )
    page = page.replace("</body>", marked("<script>" + JS + "</script>") + "</body>", 1)
    assert page.count('class="api-checks"') == len(by_kind) and page.count(
        "data:image/png;base64,"
    ) == original.count("data:image/png;base64,")
    assert source.read_text() == original
    with NamedTemporaryFile(
        "w", dir=source.parent, encoding="utf8", delete=False
    ) as out:
        out.write(page)
    new = Path(out.name)
    new.chmod(source.stat().st_mode & 0o777)
    new.replace(source)
    print(dict(count))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gallery", type=Path)
    parser.add_argument("evidence", type=Path)
    args = parser.parse_args()
    main(args.gallery, args.evidence)

"""Resolve read scopes and edits against the current site's inventory and actual pending draft."""

import re

SEAT_NUMBERS = re.compile(r"(?<![\d-])(\d{1,3})\s*번")
ZONE_TOKEN = re.compile(
    r"(?<![a-z0-9])(?:[a-z]+[-‐‑–][a-z0-9]+|(?:space\s*)?[am]\d+|d\s*hub)(?![a-z0-9])", re.I
)
SELECTED = re.compile(r"선택|찍어|찍은|이\s*(?:좌석|자리|책상)|여기")


CURRENT_SELECTION = re.compile(
    r"선택(?:된|한|해\s*(?:둔|놓은)|되어\s*있는)|(?:골라|찍어|체크해)\s*(?:둔|놓은)|"
    r"(?:고른|찍은|체크한)\s*(?:좌석|자리|책상|곳)|현재\s*선택\s*(?:목록|항목)|"
    r"(?<![가-힣])이\s*(?:좌석|자리|책상)|여기만"
)
_ZONE_REF = re.compile(rf"(?:{ZONE_TOKEN.pattern}|디\s*허브)", re.I)
_ZONE = r"@(?:\s*구역)?"
_REST = r"(?:다른|나머지)\s*구역"
_EXCLUDE = r"\s*(?:은|는|을|를)?\s*(?:제외(?:하고|한)?|빼고|빼|뺀|말고)"


def _zone_mentions(question, rows):
    aliases = {}
    for row in rows:
        zone = row["zone_id"].lower()
        aliases[zone.replace("-", "")] = zone
        if zone.startswith("space-"):
            aliases[zone.removeprefix("space-")] = zone

    zones = set()

    def mark(match):
        key = re.sub(r"[-‐‑–\s]", "", match.group().lower()).replace("디허브", "dhub")
        zones.add(aliases.get(key))
        return "@"

    return _ZONE_REF.sub(mark, question), zones


def _numbered_rows(numbers, rows):
    chosen = []
    for n in numbers:
        matches = [r for r in rows if re.search(r"(?:^|-)0*" + str(int(n)) + "$", r["label"])]
        if len(matches) != 1:
            return None
        if matches[0] not in chosen:
            chosen.append(matches[0])
    return chosen


def filter_inventory(question, rows, selected):
    """Keep single-target resolution strict for mission operations."""
    _, zones = _zone_mentions(question, rows)
    if zones:
        if None in zones or len(zones) != 1:
            return None
        rows = [r for r in rows if r["zone_id"].lower() in zones]
    elif "구역" in question and not SELECTED.search(question):
        return None
    if numbers := SEAT_NUMBERS.findall(question):
        return _numbered_rows(numbers, rows)
    if SELECTED.search(question):
        if not selected:
            return None
        scoped = [r for r in rows if r["seat_id"] in selected]
        return scoped if {r["seat_id"] for r in scoped} == set(selected) else None
    return rows


def read_inventory(question, rows, selected):
    """Resolve display candidates and denominators against the authenticated site's inventory."""
    marked, named = _zone_mentions(question, rows)
    if None in named:
        return None
    allowed = named or None
    if re.search(_ZONE + _EXCLUDE, marked):
        if len(named) != 1 or marked.count("@") != 1:
            return None
        allowed = {r["zone_id"].lower() for r in rows} - named
        marked = re.sub(_ZONE + _EXCLUDE + r"\s*(?:" + _REST + r"|구역)?", "", marked)
    elif re.search(_REST + _EXCLUDE, marked):
        if not named:
            return None
        marked = re.sub(_REST + _EXCLUDE, "", marked)
    elif re.search(_REST, marked):
        if not named or not re.search(
            r"비교|대비|차이|함께|같이|" + _ZONE + r"(?:와|과|랑|하고)", marked
        ):
            return None
        allowed = None
        marked = re.sub(_REST, "", marked)
    # Unqualified group-by phrases describe the aggregation, not a named area.
    remainder = re.sub(r"(?:각|모든|전체)\s*구역|구역별|" + _ZONE, "", marked)
    if "구역" in remainder:
        return None
    if allowed is not None:
        rows = [r for r in rows if r["zone_id"].lower() in allowed]
    uses_selection = bool(CURRENT_SELECTION.search(question))
    if uses_selection:
        if not selected:
            return None
        if re.search(r"(?:좌석|자리|책상|곳)" + _EXCLUDE, question):
            return None
        rows = [r for r in rows if r["seat_id"] in selected]
        if not rows:
            return None
    numbers = SEAT_NUMBERS.findall(question)
    if numbers:
        rows = _numbered_rows(numbers, rows)
        if rows is None:
            return None
    return rows, bool(allowed is not None or uses_selection or numbers)


def has_seat_scope(question):
    return bool(
        SEAT_NUMBERS.search(question)
        or ZONE_TOKEN.search(question)
        or re.search(r"좌석|자리|책상|구역|디\s*허브", question)
    )


def seat_label(row):
    return f"{row['zone_id'].upper()} {row['label']}번"


# Each number must belong to an explicit remove/keep clause. All other text must be
# accounted for before a new draft can supersede the existing plan.
_NUMBER_LIST = r"\d{1,3}\s*번(?:\s*(?:과|와|하고|,|및)\s*\d{1,3}\s*번)*"
_EDIT_CLAUSE = re.compile(
    rf"(?P<seats>{_NUMBER_LIST})\s*(?:(?:좌석|자리)\s*)?"
    r"(?:(?:은|는|을|를)?\s*(?P<remove>빼|제외)|(?P<keep>만))"
)
_EDIT_WORDS = re.compile(
    r"\s+|[,.!?]|아까|방금|기존|이전|미승인|그대로|그|정리|작업|초안|계획|대상|우선\s*순위|"
    r"에서|으로|로|에는|에|은|는|나머지|만|그대로|긴급|높음|높게|높은|보통|일반|"
    r"두고|두세요|둬|고|하고|해|변경|수정|바꿔|줘|주세요|주십시오|부탁해요"
)


def revise_items(question, items):
    """Resolve subset and priority, preserving membership, robot and unspecified priority."""
    if not items:
        return None
    removed, kept = set(), set()
    for match in _EDIT_CLAUSE.finditer(question):
        target = removed if match["remove"] else kept
        for number in SEAT_NUMBERS.findall(match["seats"]):
            matches = [
                r["seat_id"]
                for r in items
                if re.search(r"(?:^|-)0*" + str(int(number)) + "$", r["label"])
            ]
            if len(matches) != 1:
                return None
            target.add(matches[0])
    high = bool(re.search(r"긴급|높음|높게|높은", question))
    normal = bool(re.search(r"보통|일반", question))
    if (high and normal) or removed & kept or not (removed or kept or high or normal):
        return None
    if _EDIT_WORDS.sub("", _EDIT_CLAUSE.sub("", question)):
        return None
    remaining = [
        r for r in items if r["seat_id"] not in removed and (not kept or r["seat_id"] in kept)
    ]
    if not remaining or len({r["robot_id"] for r in remaining}) != 1:
        return None
    priorities = {r["priority"] for r in remaining}
    if not high and not normal and len(priorities) != 1:
        return None
    return {
        "seat_ids": [r["seat_id"] for r in remaining],
        "priority": "HIGH" if high else "NORMAL" if normal else priorities.pop(),
        "robot_id": remaining[0]["robot_id"],
        "title": "좌석 정리",
        "reason": "관리자가 미승인 초안의 대상 또는 우선순위를 수정함",
    }

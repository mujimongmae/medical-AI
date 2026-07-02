#!/usr/bin/env python3
"""실시간 진척 보드 생성기 — 실제 파일 생성/git 커밋/에이전트 수를 추적해 board.html을 4초마다 갱신."""
import json, os, subprocess, time, html

REPO = "/Users/joonhwikim/claude-workspace/medical-AI-hackathon"
WEB = f"{REPO}/collapse-detection/web"
ROOT = f"{REPO}/collapse-detection"
JOURNAL = "/Users/joonhwikim/.claude/projects/-Users-joonhwikim-claude-workspace-medical-AI-hackathon/fd5b1a73-6db3-41f5-9238-e2aa698b9e3f/subagents/workflows/wf_a1a21cc0-c87/journal.jsonl"
TASK_OUT = "/private/tmp/claude-501/-Users-joonhwikim-claude-workspace-medical-AI-hackathon/fd5b1a73-6db3-41f5-9238-e2aa698b9e3f/tasks/wv5to96f1.output"
OUT = f"{ROOT}/_progress/board.html"
BRANCH = "feat/collapse-detection-modules"
START = time.time()


def is_done():
    """태스크 output 파일은 시작 시 0바이트로 미리 생성되므로, 크기로 완료 판정."""
    try:
        return os.path.getsize(TASK_OUT) > 100
    except Exception:
        return False

# 추적할 산출물: (라벨, 경로, 구현으로 볼 최소 라인수)
MODULE_FILES = [
    ("공유 타입 (types)", "web/lib/types.ts", 15),
    ("카메라 (camera)", "web/lib/camera.ts", 25),
    ("카메라 훅 (useCamera)", "web/hooks/useCamera.ts", 25),
    ("탐지기 (detectors)", "web/lib/detectors.ts", 30),
    ("상태머신 (state machine)", "web/lib/collapse-state-machine.ts", 40),
    ("상태머신 테스트", "web/lib/collapse-state-machine.test.ts", 30),
    ("Zone맵", "web/lib/zone-map.ts", 20),
    ("이벤트버스", "web/lib/event-bus.ts", 20),
    ("오버레이 (overlay)", "web/components/DetectionOverlay.tsx", 30),
    ("홈캠 창 (page)", "web/app/page.tsx", 30),
    ("수신 창 (receiver)", "web/app/receiver/page.tsx", 30),
]
SPECS = [("스펙 02 로직", "02-detection-logic.md"), ("스펙 03 UI", "03-homecam-ui.md"), ("스펙 04 계약", "04-event-contract.md")]


def lines(path):
    try:
        with open(path, encoding="utf-8", errors="ignore") as f:
            return sum(1 for _ in f)
    except Exception:
        return -1


def journal_counts():
    started = done = 0
    try:
        for l in open(JOURNAL, encoding="utf-8", errors="ignore"):
            try:
                d = json.loads(l)
            except Exception:
                continue
            if d.get("type") == "started":
                started += 1
            elif d.get("type") == "result":
                done += 1
    except Exception:
        pass
    return started, done


def commits():
    try:
        out = subprocess.check_output(
            ["git", "-C", REPO, "log", "--oneline", "-8", BRANCH],
            stderr=subprocess.DEVNULL, text=True)
        return [c for c in out.strip().split("\n") if c]
    except Exception:
        return []


def render():
    started, done = journal_counts()
    cmts = commits()
    mod_commits = [c for c in cmts if "modules" in c]
    finished = os.path.exists(TASK_OUT)

    # 단계 상태
    types_ok = lines(f"{WEB}/lib/types.ts") >= 15
    pkg_ok = os.path.exists(f"{WEB}/package.json")
    specs_ok = all(os.path.exists(f"{ROOT}/{p}") for _, p in SPECS)
    foundation = pkg_ok and types_ok and specs_ok
    impl = [lbl for lbl, p, mn in MODULE_FILES[1:9] if lines(f"{WEB}/{p}") >= mn]
    modules_done = len(impl) >= 8
    integrate = lines(f"{WEB}/app/page.tsx") >= 30 and lines(f"{WEB}/app/receiver/page.tsx") >= 30
    verify = any("test(modules)" in c for c in mod_commits) or finished

    phases = [
        ("Foundation", "스캐폴딩·타입·스펙", foundation),
        ("Modules", "6개 모듈 병렬", modules_done),
        ("Integrate", "두 창 배선", integrate),
        ("Verify", "빌드·테스트·dev 스모크", verify),
    ]

    el = int(time.time() - START)
    now = time.strftime("%H:%M:%S")

    def chip(ok, running=False):
        if ok: return '<span class="s done">✓ 완료</span>'
        if running: return '<span class="s run">⟳ 진행중</span>'
        return '<span class="s wait">· 대기</span>'

    # 단계 러닝 판정: 첫 미완료 단계를 진행중으로
    ph_rows = ""
    first_pending = True
    for name, desc, ok in phases:
        running = (not ok) and first_pending and not finished
        if not ok and first_pending: first_pending = False
        ph_rows += f'<div class="ph"><div class="pn">{name}</div><div class="pd">{desc}</div>{chip(ok, running)}</div>'

    file_rows = ""
    for lbl, p, mn in MODULE_FILES:
        ln = lines(f"{WEB}/{p}")
        if ln < 0:
            st, cls = "· 없음", "wait"
        elif ln < mn:
            st, cls = f"◔ 스텁 ({ln}줄)", "run"
        else:
            st, cls = f"✓ 구현 ({ln}줄)", "done"
        file_rows += f'<tr><td>{html.escape(lbl)}</td><td class="mono">{html.escape(p)}</td><td class="{cls}">{st}</td></tr>'

    spec_rows = ""
    for lbl, p in SPECS:
        ok = os.path.exists(f"{ROOT}/{p}")
        spec_rows += f'<tr><td>{html.escape(lbl)}</td><td class="mono">{html.escape(p)}</td><td class="{"done" if ok else "wait"}">{"✓ 작성" if ok else "· 대기"}</td></tr>'

    commit_rows = "".join(f'<li class="mono">{html.escape(c)}</li>' for c in cmts) or '<li class="muted">아직 커밋 없음</li>'

    banner = '<div class="banner done">🎉 워크플로우 완료 — dev 서버 준비 단계</div>' if finished \
        else '<div class="banner run">⟳ 병렬 개발 진행 중… (4초마다 자동 갱신)</div>'

    refresh = "" if finished else '<meta http-equiv="refresh" content="4">'

    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8">{refresh}
<title>쓰러짐 감지 앱 · 진척 보드</title><style>
:root{{--bg:#0d1117;--card:#161b22;--bd:#30363d;--fg:#e6edf3;--mut:#8b949e;--done:#3fb950;--run:#d29922;--wait:#6e7681;--acc:#58a6ff}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px}}
h1{{font-size:20px;margin:0 0 4px}}.sub{{color:var(--mut);font-size:13px;margin-bottom:16px}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:1000px}}
.card{{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:16px}}
.card h2{{font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:var(--mut);margin:0 0 12px}}
.banner{{max-width:1000px;padding:12px 16px;border-radius:10px;margin-bottom:16px;font-weight:600}}
.banner.run{{background:#3a2d0b;border:1px solid #6b5011;color:#e3b341}}
.banner.done{{background:#0f2f1a;border:1px solid #1a5c32;color:#56d364}}
.ph{{display:grid;grid-template-columns:110px 1fr auto;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--bd)}}
.ph:last-child{{border:0}}.pn{{font-weight:600}}.pd{{color:var(--mut);font-size:13px}}
.s{{font-size:12px;font-weight:600;padding:3px 8px;border-radius:20px;white-space:nowrap}}
.s.done{{background:#0f2f1a;color:var(--done)}}.s.run{{background:#3a2d0b;color:var(--run)}}.s.wait{{background:#21262d;color:var(--wait)}}
table{{width:100%;border-collapse:collapse}}td{{padding:6px 4px;border-bottom:1px solid var(--bd);font-size:13px}}
.mono{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--mut)}}
td.done{{color:var(--done)}}td.run{{color:var(--run)}}td.wait{{color:var(--wait)}}
.big{{font-size:32px;font-weight:700}}.big small{{font-size:14px;color:var(--mut);font-weight:400}}
ul{{margin:0;padding-left:18px}}li{{margin:2px 0}}.muted{{color:var(--mut)}}
.foot{{max-width:1000px;color:var(--mut);font-size:12px;margin-top:16px}}
</style></head><body>
<h1>🏠 홈캠 쓰러짐 감지 앱 — 실시간 진척 보드</h1>
<div class="sub">브랜치 <span class="mono">{BRANCH}</span> · 갱신 {now} · 경과 {el//60}분 {el%60}초 · <span class="mono">/workflows</span> 가 공식 실시간 뷰</div>
{banner}
<div class="grid">
  <div class="card"><h2>단계</h2>{ph_rows}</div>
  <div class="card"><h2>에이전트 · 진행 지표</h2>
    <div class="big">{done}<small> / {started} 완료</small></div>
    <div class="sub">모듈 구현: {len(impl)}/8 · 커밋: {len(mod_commits)}/4</div>
  </div>
  <div class="card" style="grid-column:1/3"><h2>산출 파일</h2><table>{file_rows}</table></div>
  <div class="card"><h2>스펙 문서</h2><table>{spec_rows}</table></div>
  <div class="card"><h2>최근 커밋</h2><ul>{commit_rows}</ul></div>
</div>
<div class="foot">이 보드는 실제 파일 생성·git 커밋·에이전트 수를 추적한 근사 뷰입니다. 정확한 에이전트 트리는 <span class="mono">/workflows</span> 를 참고하세요.</div>
</body></html>"""


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    for _ in range(450):  # 최대 ~30분 (4초 * 450)
        with open(OUT, "w", encoding="utf-8") as f:
            f.write(render())
        if os.path.exists(TASK_OUT):
            # 완료 후 마지막 한 번 더 렌더하고 종료
            with open(OUT, "w", encoding="utf-8") as f:
                f.write(render())
            break
        time.sleep(4)


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from pathlib import Path
from typing import Any, Callable

from playwright.sync_api import sync_playwright

from harness import http_get_json, http_get_text, open_context, run_isolated_server
from tier1_features import TIER1_TESTS
from tier2_boundaries import TIER2_TESTS
from tier3_pairwise import TIER3_TESTS
from tier4_scenarios import TIER4_TESTS

TIERS: dict[int, list[tuple[str, Callable[..., None]]]] = {
    1: TIER1_TESTS,
    2: TIER2_TESTS,
    3: TIER3_TESTS,
    4: TIER4_TESTS,
}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="keybr.com Opaque-Box Playwright E2E Test Runner")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--tier", type=int, choices=[1, 2, 3, 4], help="Run a single test tier (1-4)")
    group.add_argument("--all", action="store_true", help="Run all 4 tiers sequentially")
    group.add_argument(
        "--self-test-isolated",
        action="store_true",
        help="Smoke-check ephemeral server startup, Playwright connectivity, and clean teardown",
    )
    parser.add_argument("--base-url", default="http://localhost:3000", help="Target server base URL")
    parser.add_argument("--keytrace-dir", default=None, help="Optional KeyTrace events directory")
    parser.add_argument("--filter", default=None, help="Comma-separated test name substring filter")
    parser.add_argument("--list", action="store_true", help="List selected tests and exit")
    parser.add_argument("--json-report", default=None, help="Write structured JSON test report to path")
    parser.add_argument("--headed", action="store_true", help="Run Chromium in headed mode")
    parser.add_argument(
        "--isolated",
        action="store_true",
        help="Start an isolated ephemeral root/index.js server instead of --base-url",
    )
    return parser.parse_args(argv)


def collect_tests(tier: int | None, run_all: bool, filter_str: str | None) -> list[tuple[int, str, Callable[..., None]]]:
    selected_tiers = [1, 2, 3, 4] if (run_all or tier is None) else [tier]
    items: list[tuple[int, str, Callable[..., None]]] = []
    for t in selected_tiers:
        for name, fn in TIERS[t]:
            items.append((t, name, fn))
    if filter_str:
        needles = [s.strip() for s in filter_str.split(",") if s.strip()]
        items = [item for item in items if any(n in item[1] for n in needles)]
    return items


def run_self_test_isolated(headed: bool = False) -> int:
    t0 = time.monotonic()
    with run_isolated_server() as (base_url, kt_dir):
        print(f"[self-test-isolated] Server ready at {base_url} (keytrace_dir={kt_dir})", flush=True)
        st_root, _ = http_get_text(f"{base_url}/")
        st_sync, sync_json = http_get_json(f"{base_url}/_/sync/keytrace?since=0&migrate=1")
        st_sum, sum_json = http_get_json(f"{base_url}/_/keytrace/summary?days=14")
        assert st_root == 200 and st_sync == 200 and st_sum == 200
        assert "records" in sync_json and isinstance(sum_json, dict)

        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=not headed)
            try:
                with open_context(browser, base_url, settings={"keyboard.language": "zh-sp"}) as (_, page, _, _):
                    page.goto(f"{base_url}/", wait_until="domcontentloaded")
                    lang = page.evaluate("() => document.documentElement.getAttribute('lang')")
                    assert lang == "zh-hans", f"Expected zh-hans on /, got {lang!r}"
            finally:
                browser.close()
    dt = time.monotonic() - t0
    print(f"[self-test-isolated] PASS in {dt:.2f}s (clean teardown complete)", flush=True)
    return 0


def execute_suite(
    tests: list[tuple[int, str, Callable[..., None]]],
    *,
    base_url: str,
    keytrace_dir: str | None,
    headed: bool,
    json_report_path: str | None,
) -> int:
    results: list[dict[str, Any]] = []
    passed = 0
    failed = 0
    suite_start = time.monotonic()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headed)
        try:
            for tier_num, name, fn in tests:
                t0 = time.monotonic()
                status = "PASS"
                err_msg: str | None = None
                tb_str: str | None = None
                try:
                    fn(browser, base_url, keytrace_dir)
                    passed += 1
                except Exception as exc:  # noqa: BLE001
                    status = "FAIL"
                    failed += 1
                    err_msg = f"{type(exc).__name__}: {exc}"
                    tb_str = traceback.format_exc()
                dt = time.monotonic() - t0
                results.append(
                    {
                        "tier": tier_num,
                        "name": name,
                        "status": status,
                        "duration_s": round(dt, 3),
                        "error": err_msg,
                        "traceback": tb_str,
                    }
                )
                print(f"[T{tier_num}] {status:4s} ({dt:5.2f}s) {name}", flush=True)
                if err_msg:
                    print(f"       -> {err_msg}", flush=True)
        finally:
            browser.close()

    total_dt = time.monotonic() - suite_start
    print(f"\nSummary: {passed}/{len(tests)} passed, {failed} failed in {total_dt:.2f}s", flush=True)

    if json_report_path:
        report = {
            "base_url": base_url,
            "total": len(tests),
            "passed": passed,
            "failed": failed,
            "duration_s": round(total_dt, 3),
            "results": results,
        }
        out_path = Path(json_report_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    return 0 if failed == 0 else 1


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if args.self_test_isolated:
        return run_self_test_isolated(headed=args.headed)

    if args.list:
        tests = collect_tests(args.tier, args.all or args.tier is None, args.filter)
        counts = {1: 0, 2: 0, 3: 0, 4: 0}
        for t, name, _ in tests:
            counts[t] += 1
            print(f"[T{t}] {name}")
        print(f"Total: {len(tests)} tests (T1={counts[1]}, T2={counts[2]}, T3={counts[3]}, T4={counts[4]})")
        return 0

    if not args.all and args.tier is None:
        print("Error: specify --tier {1,2,3,4}, --all, --list, or --self-test-isolated", file=sys.stderr)
        return 2

    tests = collect_tests(args.tier, args.all, args.filter)
    if not tests:
        print("Error: no tests matched selection/filter.", file=sys.stderr)
        return 2

    if args.isolated:
        with run_isolated_server() as (iso_url, iso_kt):
            kt = args.keytrace_dir or str(iso_kt)
            return execute_suite(
                tests,
                base_url=iso_url,
                keytrace_dir=kt,
                headed=args.headed,
                json_report_path=args.json_report,
            )

    return execute_suite(
        tests,
        base_url=args.base_url.rstrip("/"),
        keytrace_dir=args.keytrace_dir,
        headed=args.headed,
        json_report_path=args.json_report,
    )


if __name__ == "__main__":
    raise SystemExit(main())

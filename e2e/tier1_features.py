from __future__ import annotations

import contextlib
import re
import time
from pathlib import Path
from typing import Callable, Iterator

from playwright.sync_api import Browser, Page, expect

from harness import (
    COLOR_HIT_RGB,
    COLOR_MISS_RGB,
    GITHUB_URL,
    VIEW_BARE,
    VIEW_COMPACT,
    VIEW_NORMAL,
    build_realistic_keytrace_events,
    count_keytrace_practice_chrome,
    dismiss_tour_if_open,
    ensure_practice_language,
    focus_en_input,
    focus_zh_input,
    get_help_button,
    get_html_attrs,
    get_practice_view,
    get_prefs_cookie,
    get_settings_storage,
    get_theme_button,
    get_toolbar_buttons,
    get_zoomer_positions,
    has_keytrace_mode_setting,
    http_get_json,
    install_toast_recorder,
    is_tour_open,
    make_result_json,
    max_chrome_delta,
    measure_practice_boxes,
    measure_tour_spotlight_and_anchor,
    open_context,
    open_settings,
    press_char,
    read_en_cursor_error_state,
    read_en_lesson_text,
    read_indexeddb_results,
    read_key_selector_tiles,
    read_mastery_legend,
    read_mastery_tiles,
    read_practice_key_set,
    read_recorded_toasts,
    read_summary_stats,
    read_target_speed_setting,
    read_zh_lesson_tokens,
    read_zoomer_styles,
    rgb_brightness,
    rgb_close,
    run_isolated_server,
    save_settings,
    seed_indexeddb_results,
    select_keytrace_mode_setting,
    select_profile_grouper,
    select_settings_font,
    select_zh_scheme,
    set_target_speed_setting,
    set_typing_options,
    skip_lesson,
    type_key_stream,
    wait_for_indexeddb_count,
    wait_for_practice_ready,
    wait_for_recorded_toast,
    write_keytrace_jsonl,
)


# ===========================================================================
# F1: /profile Statistics & Mastery Calibration (R1) — 5 tests
# ===========================================================================


def t1_f1_01_profile_high_error_fast_key_not_green(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    now = int(time.time() * 1000)
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us", "lesson.targetSpeed": 175},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        rec = make_result_json(
            "en-us",
            ts=now - 5000,
            length=65,
            time_ms=14300,
            errors=12,
            histogram={
                ord("e"): (18, 12, 220),  # fast 220ms, but 66.7% error rate!
                ord("n"): (25, 0, 220),   # fast 220ms, 0% errors
                ord("i"): (22, 0, 230),
            },
        )
        seed_indexeddb_results(page, [rec])
        page.reload(wait_until="domcontentloaded")

        legend = read_mastery_legend(page)
        tiles = read_mastery_tiles(page)
        ks = read_key_selector_tiles(page)

        assert rgb_close(tiles["N"]["bg"], legend["done"]), f"Clean fast key N should be done green: {tiles['N']}"
        assert not rgb_close(tiles["E"]["bg"], legend["done"]), f"High-error fast key E must NOT be done green: {tiles['E']}"
        assert not rgb_close(ks[ord("e")]["bg"], ks[ord("n")]["bg"]), (
            f"KeySelector E ({ks[ord('e')]}) should reflect error penalty vs clean N ({ks[ord('n')]})"
        )


def t1_f1_02_profile_low_sample_fast_key_not_green(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    now = int(time.time() * 1000)
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us", "lesson.targetSpeed": 175},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        rec = make_result_json(
            "en-us",
            ts=now - 5000,
            length=54,
            time_ms=11880,
            errors=0,
            histogram={
                ord("a"): (4, 0, 210),   # fast, but < 15 hits sample threshold
                ord("i"): (25, 0, 210),  # fast, >= 15 hits
                ord("t"): (25, 0, 220),
            },
        )
        seed_indexeddb_results(page, [rec])
        page.reload(wait_until="domcontentloaded")

        legend = read_mastery_legend(page)
        tiles = read_mastery_tiles(page)
        assert rgb_close(tiles["I"]["bg"], legend["done"]), f"Well-sampled fast I should be done: {tiles['I']}"
        assert not rgb_close(tiles["A"]["bg"], legend["done"]), f"Low-sample A (4 hits) must NOT be done green: {tiles['A']}"


def t1_f1_03_profile_zh_realtime_mastery_regression_not_green(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    now = int(time.time() * 1000)
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp", "lesson.zhTargetSpeed": 175},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        # Session 0: fast 'j' at 200ms (sets bestTimeToType = 200ms).
        # Sessions 1..12: slow 'j' at 850ms -> makeFilter(0.1) EMA rises to ~666ms >> 342.86ms!
        recs = [
            make_result_json(
                "zh-sp",
                ts=now - 100_000,
                length=50,
                time_ms=10000,
                errors=0,
                histogram={
                    ord("j"): (20, 0, 200),
                    ord("a"): (20, 0, 210),
                    ord("n"): (20, 0, 210),
                },
            )
        ]
        for idx in range(1, 13):
            recs.append(
                make_result_json(
                    "zh-sp",
                    ts=now - 100_000 + idx * 5000,
                    length=50,
                    time_ms=25000,
                    errors=0,
                    histogram={
                        ord("j"): (20, 0, 850),
                        ord("a"): (20, 0, 210),
                        ord("n"): (20, 0, 210),
                    },
                )
            )
        seed_indexeddb_results(page, recs)
        page.reload(wait_until="domcontentloaded")

        legend = read_mastery_legend(page)
        tiles = read_mastery_tiles(page)
        assert rgb_close(tiles["A"]["bg"], legend["done"]), f"Fast A should be done green: {tiles['A']}"
        assert not rgb_close(tiles["J"]["bg"], legend["done"]), (
            f"Regressed ZH key J (EMA ~666ms vs target 342.86ms) must NOT be done green: {tiles['J']}"
        )


def t1_f1_04_profile_summary_stats_reflect_seeded_sessions(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    now = int(time.time() * 1000)
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        recs = [
            make_result_json(
                "en-us",
                ts=now - (3 - i) * 5000,
                length=40,
                time_ms=12000,  # 200 CPM = 40 WPM
                errors=1,
                histogram={ord("e"): (14, 1, 240), ord("n"): (13, 0, 260), ord("i"): (13, 0, 280)},
            )
            for i in range(3)
        ]
        seed_indexeddb_results(page, recs)
        page.reload(wait_until="domcontentloaded")

        all_stats = read_summary_stats(page, r"总统计数据|All Time Statistics")
        today_stats = read_summary_stats(page, r"今日统计数据|Statistics for Today")
        assert all_stats.get("字符") == "120" or all_stats.get("Characters") == "120", f"Unexpected all_stats: {all_stats}"
        assert all_stats.get("活跃天数") == "1" or all_stats.get("Active days") == "1", f"Unexpected all_stats: {all_stats}"
        assert today_stats.get("字符") == "120" or today_stats.get("Characters") == "120", f"Unexpected today_stats: {today_stats}"
        assert page.locator("main canvas").count() >= 2


def t1_f1_05_profile_keytrace_sync_ingests_realistic_jsonl(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    today_str = time.strftime("%Y-%m-%d", time.localtime())
    now_ms = int(time.time() * 1000) - 30_000
    created_file = None
    if keytrace_dir is not None:
        from pathlib import Path

        events = build_realistic_keytrace_events(
            base_ts=now_ms,
            tokens=[
                ("enter ", 240.0, 0),
                ("intent ", 250.0, 0),
                ("entire ", 260.0, 1),
                ("inert ", 245.0, 0),
                ("tenet ", 235.0, 0),
                ("retire ", 255.0, 0),
                ("trite ", 240.0, 0),
            ],
        )
        created_file = write_keytrace_jsonl(Path(keytrace_dir), today_str, events)

    try:
        status, summary_json = http_get_json(f"{base_url}/_/keytrace/summary?days=14")
        assert status == 200 and isinstance(summary_json, dict)
        status_sync, sync_json = http_get_json(f"{base_url}/_/sync/keytrace?since=0&migrate=1")
        assert status_sync == 200 and "records" in sync_json

        with open_context(
            browser,
            base_url,
            settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
        ) as (_, page, _, _):
            page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
            sync_btn = page.locator('main button:has-text("同步日常数据"), main button:has-text("Sync KeyTrace")').first
            expect(sync_btn).to_be_visible(timeout=10000)
            sync_btn.click()
            page.wait_for_function(
                """() => {
                    const t = document.body.innerText || '';
                    return t.includes('已同步') || t.includes('已是最新') || t.includes('Synced') || t.includes('up to date');
                }""",
                timeout=10000,
            )
            if created_file is not None:
                assert len(sync_json["records"]) >= 1, f"Expected synced KeyTrace records, got {sync_json}"
                tiles = read_mastery_tiles(page)
                legend = read_mastery_legend(page)
                assert not rgb_close(tiles["E"]["bg"], legend["none"]), f"KeyTrace synced E should have data: {tiles['E']}"
    finally:
        if created_file is not None and created_file.exists():
            created_file.unlink(missing_ok=True)


# ===========================================================================
# F2: / 中文/英文 Toggle Layout Stability (<= 1px) (R2) — 5 tests
# ===========================================================================


def t1_f2_01_zh_to_en_toggle_layout_shift_le_1px(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        before = measure_practice_boxes(page)
        ensure_practice_language(page, "en")
        page.wait_for_timeout(150)
        after = measure_practice_boxes(page)
        delta = max_chrome_delta(before, after)
        assert delta <= 1.0, f"ZH->EN chrome/anchor shift {delta:.2f}px > 1.0px (before={before}, after={after})"
        # Plan B compact-fit: EN textArea hugs its actual text (no giant empty filler box below)
        assert after["textContent"] is not None
        assert 40 < after["textArea"]["height"] < 180, (
            f"Expected compact EN textArea height in (40, 180), got {after}"
        )
        assert after["textArea"]["height"] - after["textContent"]["height"] <= 48, (
            f"Unexpected vertical slack inside EN textArea: {after}"
        )
        kb_gap = after["keyboard"]["y"] - (after["textArea"]["y"] + after["textArea"]["height"])
        assert 0 < kb_gap < 100, f"Unexpected gap between EN textArea and keyboard: {kb_gap:.1f}px ({after})"


def t1_f2_02_en_to_zh_toggle_layout_shift_le_1px(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "en")
        before = measure_practice_boxes(page)
        ensure_practice_language(page, "zh")
        page.wait_for_timeout(150)
        after = measure_practice_boxes(page)
        delta = max_chrome_delta(before, after)
        assert delta <= 1.0, f"EN->ZH chrome/anchor shift {delta:.2f}px > 1.0px (before={before}, after={after})"
        # Verify Plan B compact-fit in both EN (before) and ZH (after)
        assert before["textContent"] is not None
        assert 40 < before["textArea"]["height"] < 180, (
            f"Expected compact EN textArea height in (40, 180), got {before}"
        )
        assert before["textArea"]["height"] - before["textContent"]["height"] <= 48, (
            f"Unexpected vertical slack inside EN textArea: {before}"
        )
        kb_gap = before["keyboard"]["y"] - (before["textArea"]["y"] + before["textArea"]["height"])
        assert 0 < kb_gap < 100, f"Unexpected gap between EN textArea and keyboard: {kb_gap:.1f}px ({before})"
        assert after["textContent"] is not None
        assert after["textArea"]["height"] >= 40
        assert after["textArea"]["height"] - after["textContent"]["height"] <= 48, (
            f"Unexpected vertical slack inside ZH textArea: {after}"
        )
        assert after["textAreaScrollHeight"] <= after["textAreaClientHeight"] + 2, (
            f"Unexpected vertical overflow inside ZH textArea: {after}"
        )


def t1_f2_03_zh_en_toggle_no_zero_height_loading_collapse(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        page.evaluate(
            """() => {
                window.__e2eCollapseStats = { minSectionH: 99999, sawZeroTextArea: false, active: true };
                const sec = document.querySelector('main section');
                const sample = () => {
                    if (!window.__e2eCollapseStats.active) return;
                    if (sec) {
                        const h = sec.getBoundingClientRect().height;
                        if (h < window.__e2eCollapseStats.minSectionH) window.__e2eCollapseStats.minSectionH = h;
                    }
                    const ta = document.querySelector('main [data-scheme], main div[dir="ltr"]');
                    if (!ta || ta.getBoundingClientRect().height < 20) {
                        window.__e2eCollapseStats.sawZeroTextArea = true;
                    }
                    requestAnimationFrame(sample);
                };
                requestAnimationFrame(sample);
            }"""
        )
        before = measure_practice_boxes(page)
        ensure_practice_language(page, "en")
        ensure_practice_language(page, "zh")
        page.wait_for_timeout(120)
        after = measure_practice_boxes(page)
        stats = page.evaluate(
            """() => {
                window.__e2eCollapseStats.active = false;
                return window.__e2eCollapseStats;
            }"""
        )
        assert stats["minSectionH"] > 150, f"Detected section collapse during toggle: {stats}"
        assert not stats["sawZeroTextArea"], f"TextArea unmounted/collapsed during toggle: {stats}"
        delta = max_chrome_delta(before, after)
        assert delta <= 1.0, f"Roundtrip chrome/anchor shift {delta:.2f}px > 1.0px"


def t1_f2_04_zh_to_en_to_zh_roundtrip_controls_and_buttons_stable(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        b0 = measure_practice_boxes(page)
        ensure_practice_language(page, "en")
        b1 = measure_practice_boxes(page)
        ensure_practice_language(page, "zh")
        b2 = measure_practice_boxes(page)
        assert max_chrome_delta(b0, b1) <= 1.0
        assert max_chrome_delta(b0, b2) <= 1.0


def t1_f2_05_en_ui_zh_en_toggle_layout_shift_le_1px(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/en", wait_until="domcontentloaded")
        assert get_html_attrs(page)["lang"] == "en"
        ensure_practice_language(page, "en")
        before = measure_practice_boxes(page)
        ensure_practice_language(page, "zh")
        page.wait_for_timeout(150)
        after = measure_practice_boxes(page)
        delta = max_chrome_delta(before, after)
        assert delta <= 1.0, f"EN-UI EN->ZH chrome/anchor shift {delta:.2f}px > 1.0px"


# ===========================================================================
# F3: Help Tutorial Reset, Alignment & State Restore (R3) — 5 tests
# ===========================================================================


def t1_f3_01_compact_view_reset_and_restore_via_close_x(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    kb_selector = 'main section svg[height="23rem"]'
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
        practice_view=VIEW_COMPACT,
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        assert get_practice_view(page) == VIEW_COMPACT
        expect(page.locator(kb_selector)).to_have_count(0)

        # Trigger click without Playwright auto-scrolling viewport away from pre_scroll
        get_help_button(page).evaluate("el => el.click()")
        assert is_tour_open(page)
        # Temporarily reset to Normal view -> virtual keyboard visible
        expect(page.locator(kb_selector)).to_have_count(1)

        # Close via top-right X link button (a:has(svg) without footer text)
        close_x = page.locator('main a:has(svg):not(:has-text("上一个")):not(:has-text("下一个")):not(:has-text("Previous")):not(:has-text("Next"))').first
        close_x.click()
        page.wait_for_timeout(150)
        assert not is_tour_open(page)
        assert get_practice_view(page) == VIEW_COMPACT
        expect(page.locator(kb_selector)).to_have_count(0)


def t1_f3_02_bare_view_reset_and_restore_via_finish_close(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    kb_selector = 'main section svg[height="23rem"]'
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
        practice_view=VIEW_BARE,
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        assert get_practice_view(page) == VIEW_BARE
        expect(page.locator('main section :text("衡量标准")')).to_have_count(0)
        expect(page.locator(kb_selector)).to_have_count(0)

        # Trigger click without Playwright auto-scrolling viewport away from pre_scroll
        get_help_button(page).evaluate("el => el.click()")
        assert is_tour_open(page)
        expect(page.locator('main section :text("衡量标准")')).to_have_count(1)
        expect(page.locator(kb_selector)).to_have_count(1)

        next_btn = page.locator('main a:has-text("下一个"), main a:has-text("Next")').first
        for _ in range(11):
            next_btn.click()
        finish_btn = page.locator('main a:has-text("关闭"), main a:has-text("Close")').first
        expect(finish_btn).to_be_visible(timeout=5000)
        finish_btn.click()
        page.wait_for_timeout(150)

        assert not is_tour_open(page)
        assert get_practice_view(page) == VIEW_BARE
        expect(page.locator('main section :text("衡量标准")')).to_have_count(0)
        expect(page.locator(kb_selector)).to_have_count(0)


def t1_f3_03_zoomer_suspended_during_tour_and_restored_without_overwriting_storage(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    seeded_zoom = {
        "Indicators/Normal": {"x": 24, "y": 14, "zoom": 1.1},
        "TextArea/Normal": {"x": -18, "y": 18, "zoom": 0.9},
        "Keyboard/Normal": {"x": 16, "y": -12, "zoom": 1.05},
    }
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
        zoomer_positions=seeded_zoom,
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        pre_styles = read_zoomer_styles(page)
        assert pre_styles["textArea"]["left"] != 0 or pre_styles["textArea"]["transform"] != "scale(1)"

        # Trigger click without Playwright auto-scrolling viewport away from pre_scroll
        get_help_button(page).evaluate("el => el.click()")
        assert is_tour_open(page)
        tour_styles = read_zoomer_styles(page)
        for k in ("indicators", "textArea", "keyboard"):
            assert tour_styles[k]["left"] == 0 and tour_styles[k]["top"] == 0, f"Zoomer {k} not reset in tour: {tour_styles}"
            assert tour_styles[k]["transform"] == "scale(1)", f"Zoomer {k} scale not 1 in tour: {tour_styles}"

        # Storage must NOT be overwritten with {0,0,1} during tour!
        during_storage = get_zoomer_positions(page)
        assert during_storage is not None
        assert during_storage["TextArea/Normal"]["zoom"] != 1 or during_storage["TextArea/Normal"]["x"] != 0, (
            f"localStorage['keybr.zoomer.positions'] was overwritten during tour: {during_storage}"
        )

        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        assert not is_tour_open(page)
        post_styles = read_zoomer_styles(page)
        assert post_styles["textArea"]["left"] == pre_styles["textArea"]["left"]
        assert post_styles["textArea"]["transform"] == pre_styles["textArea"]["transform"]


def t1_f3_04_scroll_position_reset_to_top_and_restored_after_tour(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        viewport={"width": 1280, "height": 450},
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        page.evaluate("() => window.scrollTo(0, 240)")
        page.wait_for_timeout(80)
        pre_scroll = page.evaluate("() => window.scrollY")
        assert pre_scroll > 40, f"Expected scrollable viewport on 1280x450, got scrollY={pre_scroll}"

        # Trigger click without Playwright auto-scrolling viewport away from pre_scroll
        get_help_button(page).evaluate("el => el.click()")
        assert is_tour_open(page)
        during_scroll = page.evaluate("() => window.scrollY")
        assert during_scroll == 0, f"Expected scrollY=0 while tour open, got {during_scroll}"

        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        post_scroll = page.evaluate("() => window.scrollY")
        assert abs(post_scroll - pre_scroll) <= 5, f"Expected scrollY restored to ~{pre_scroll}, got {post_scroll}"


def t1_f3_05_spotlight_and_popup_alignment_all_anchored_slides(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    seeded_zoom = {
        "Indicators/Normal": {"x": 20, "y": 15, "zoom": 1.15},
        "TextArea/Normal": {"x": -15, "y": 20, "zoom": 0.9},
        "Keyboard/Normal": {"x": 15, "y": -10, "zoom": 1.1},
    }
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
        practice_view=VIEW_COMPACT,
        zoomer_positions=seeded_zoom,
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        # Trigger click without Playwright auto-scrolling viewport away from pre_scroll
        get_help_button(page).evaluate("el => el.click()")
        assert is_tour_open(page)

        next_btn = page.locator('main a:has-text("下一个"), main a:has-text("Next")').first
        for slide_idx in range(12):
            if slide_idx >= 4:
                info = measure_tour_spotlight_and_anchor(page, slide_idx)
                anchor = info["anchorRect"]
                marker = info["markerRect"]
                popup = info["popupRect"]
                vp = info["viewport"]
                assert anchor is not None and marker is not None, f"Missing spotlight/anchor on slide {slide_idx}: {info}"
                # Spotlight places marker at anchorBox +/- 10px
                assert abs((marker["x"] + 10) - anchor["x"]) <= 4.0, f"Slide {slide_idx} X mismatch: {info}"
                assert abs((marker["y"] + 10) - anchor["y"]) <= 4.0, f"Slide {slide_idx} Y mismatch: {info}"
                assert abs((marker["width"] - 20) - anchor["width"]) <= 4.0, f"Slide {slide_idx} W mismatch: {info}"
                assert abs((marker["height"] - 20) - anchor["height"]) <= 4.0, f"Slide {slide_idx} H mismatch: {info}"
                assert popup is not None
                assert popup["x"] >= 0 and popup["y"] >= 0
                assert popup["x"] + popup["width"] <= vp["width"] + 2
                assert popup["y"] + popup["height"] <= vp["height"] + 2
            if slide_idx < 11:
                next_btn.click()

        page.locator('main a:has-text("关闭"), main a:has-text("Close")').first.click()
        assert get_practice_view(page) == VIEW_COMPACT


# ===========================================================================
# F4: <nav> GitHub Repository Link (R4) — 5 tests
# ===========================================================================


def t1_f4_01_nav_contains_github_repo_link(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(browser, base_url, settings={"keyboard.language": "zh-sp"}) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        link = page.locator(f'nav a[href="{GITHUB_URL}"]')
        expect(link).to_be_visible(timeout=10000)
        expect(link).to_have_attribute("target", "_blank")
        rel = link.get_attribute("rel") or ""
        assert "noopener" in rel, f"Expected noopener in rel={rel!r}"
        assert "GitHub" in (link.inner_text() or "")


def t1_f4_02_nav_github_link_present_on_profile_and_keytrace(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(browser, base_url, settings={"keyboard.language": "zh-sp"}) as (_, page, _, _):
        for route_path in ("/profile", "/keytrace"):
            page.goto(f"{base_url}{route_path}", wait_until="domcontentloaded")
            link = page.locator(f'nav a[href="{GITHUB_URL}"]')
            expect(link).to_be_visible(timeout=10000)


def t1_f4_03_nav_github_link_present_on_en_routes(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(browser, base_url, settings={"keyboard.language": "en"}) as (_, page, _, _):
        for route_path in ("/en", "/en/profile"):
            page.goto(f"{base_url}{route_path}", wait_until="domcontentloaded")
            assert get_html_attrs(page)["lang"] == "en"
            link = page.locator(f'nav a[href="{GITHUB_URL}"]')
            expect(link).to_be_visible(timeout=10000)


def t1_f4_04_nav_github_link_accessible_and_visible_in_both_themes(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp"},
        prefs_cookie={"color": "light", "font": "open-sans"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        link = page.locator(f'nav a[href="{GITHUB_URL}"]')
        expect(link).to_be_visible(timeout=10000)
        box1 = link.bounding_box()
        assert box1 is not None and box1["width"] > 10 and box1["height"] > 10

        get_theme_button(page).click()
        expect(page.locator("html")).to_have_attribute("data-color", "dark")
        box2 = link.bounding_box()
        assert box2 is not None and box2["width"] > 10 and box2["height"] > 10


def t1_f4_05_nav_github_link_opens_target_href(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(browser, base_url, settings={"keyboard.language": "zh-sp"}) as (ctx, page, _, _):
        ctx.route(
            "https://github.com/**",
            lambda route: route.fulfill(
                status=200,
                content_type="text/html",
                body="<html><body>ok</body></html>",
            ),
        )
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        link = page.locator(f'nav a[href="{GITHUB_URL}"]')
        expect(link).to_be_visible(timeout=10000)
        with page.expect_popup(timeout=10000) as popup_info:
            link.click()
        popup = popup_info.value
        popup.wait_for_load_state("domcontentloaded", timeout=10000)
        assert popup.url.startswith(GITHUB_URL), f"Expected popup url to start with {GITHUB_URL}, got {popup.url!r}"


# ===========================================================================
# F5: Direct Dark/Light Theme Toggle (No Popover) (R5) — 5 tests
# ===========================================================================


def t1_f5_01_light_to_dark_direct_toggle_updates_attr_and_cookie(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp"},
        prefs_cookie={"color": "light", "font": "open-sans"},
    ) as (ctx, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        assert get_html_attrs(page)["color"] == "light"
        get_theme_button(page).click()
        expect(page.locator("html")).to_have_attribute("data-color", "dark")
        cookie = get_prefs_cookie(ctx)
        assert cookie is not None and cookie.get("color") == "dark", f"Unexpected prefs cookie: {cookie}"


def t1_f5_02_dark_to_light_no_popover_menu_or_designer_dialog(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp"},
        prefs_cookie={"color": "dark", "font": "open-sans"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        assert get_html_attrs(page)["color"] == "dark"
        get_theme_button(page).click()
        expect(page.locator("html")).to_have_attribute("data-color", "light")
        expect(page.locator('[role="menu"], [role="menuitem"], [role="dialog"]')).to_have_count(0)


def t1_f5_03_theme_toggle_persists_across_reload(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp"},
        prefs_cookie={"color": "light", "font": "open-sans"},
    ) as (ctx, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        get_theme_button(page).click()
        expect(page.locator("html")).to_have_attribute("data-color", "dark")
        page.reload(wait_until="domcontentloaded")
        assert get_html_attrs(page)["color"] == "dark"
        assert (get_prefs_cookie(ctx) or {}).get("color") == "dark"


def t1_f5_04_theme_toggle_changes_computed_background_brightness(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp"},
        prefs_cookie={"color": "light", "font": "open-sans"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        light_bg = page.evaluate("() => window.getComputedStyle(document.body).backgroundColor")
        get_theme_button(page).click()
        expect(page.locator("html")).to_have_attribute("data-color", "dark")
        dark_bg = page.evaluate("() => window.getComputedStyle(document.body).backgroundColor")
        light_l = rgb_brightness(light_bg) or 0.0
        dark_l = rgb_brightness(dark_bg) or 0.0
        assert light_l > dark_l + 80.0, f"Expected significant brightness drop light={light_bg} -> dark={dark_bg}"


def t1_f5_05_system_initial_theme_toggles_cleanly_to_opposite(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        color_scheme="dark",
        settings={"keyboard.language": "zh-sp"},
        prefs_cookie={"color": "system", "font": "open-sans"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        assert get_html_attrs(page)["color"] == "system"
        get_theme_button(page).click()
        expect(page.locator("html")).to_have_attribute("data-color", "light")

    with open_context(
        browser,
        base_url,
        color_scheme="light",
        settings={"keyboard.language": "zh-sp"},
        prefs_cookie={"color": "system", "font": "open-sans"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        assert get_html_attrs(page)["color"] == "system"
        get_theme_button(page).click()
        expect(page.locator("html")).to_have_attribute("data-color", "dark")


# ===========================================================================
# F6: Toolbar Font Button Removed + Settings Font Intact (R6) — 5 tests
# ===========================================================================


def t1_f6_01_toolbar_has_only_two_buttons_no_font_button(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(browser, base_url, settings={"keyboard.language": "zh-sp"}) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        btns = get_toolbar_buttons(page)
        expect(btns).to_have_count(2)
        title1 = btns.nth(1).get_attribute("title") or ""
        assert ("全屏" in title1) or ("full-screen" in title1), f"2nd button should be fullscreen, got {title1!r}"


def t1_f6_02_toolbar_has_two_buttons_on_en_and_profile(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(browser, base_url, settings={"keyboard.language": "en"}) as (_, page, _, _):
        for path in ("/en", "/profile", "/en/profile"):
            page.goto(f"{base_url}{path}", wait_until="domcontentloaded")
            expect(get_toolbar_buttons(page)).to_have_count(2)


def t1_f6_03_settings_font_selector_changes_zh_hanzi_font(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        chosen = select_settings_font(page, r"楷体")
        assert "楷体" in chosen
        save_settings(page)
        stored = get_settings_storage(page) or {}
        assert stored.get("textDisplay.font") == "KaiTi-400-normal", f"Unexpected font setting: {stored}"
        tokens = read_zh_lesson_tokens(page)
        font_fam = tokens["words"][0]["units"][0]["fontFamily"] or ""
        assert "KaiTi" in font_fam, f"Expected KaiTi fontFamily, got {font_fam!r}"


def t1_f6_04_settings_font_selector_changes_en_text_font(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "en")
        open_settings(page)
        chosen = select_settings_font(page, r"^Roboto Mono$")
        assert chosen == "Roboto Mono"
        save_settings(page)
        stored = get_settings_storage(page) or {}
        assert stored.get("textDisplay.font") == "Roboto Mono-400-normal", f"Unexpected font setting: {stored}"
        ff = page.locator('main div[dir="ltr"]').first.evaluate("el => window.getComputedStyle(el).fontFamily")
        assert "Roboto Mono" in ff, f"Expected Roboto Mono in computed fontFamily, got {ff!r}"


def t1_f6_05_settings_font_persists_across_reload(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        select_settings_font(page, r"^微软雅黑$")
        save_settings(page)
        page.reload(wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        stored = get_settings_storage(page) or {}
        assert stored.get("textDisplay.font") == "Microsoft YaHei-400-normal"
        tokens = read_zh_lesson_tokens(page)
        font_fam = tokens["words"][0]["units"][0]["fontFamily"] or ""
        assert "Microsoft YaHei" in font_fam, f"Expected Microsoft YaHei after reload, got {font_fam!r}"


# ===========================================================================
# F7: Chinese Typing Input Options (R7) — 5 tests
# ===========================================================================


def t1_f7_01_zh_sp_stop_on_error_true_halts_cursor_and_recovers(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        set_typing_options(page, stop_on_error=True, forgive_errors=False, space_skips_words=False)
        save_settings(page)
        focus_zh_input(page)

        tokens = read_zh_lesson_tokens(page)
        w0 = tokens["words"][0]
        w0_body = w0["bodyCode"]
        wrong = "x" if w0_body[0] != "x" else "q"
        press_char(page, wrong)
        after_err = read_zh_lesson_tokens(page)
        assert after_err["words"][0]["units"][0]["cursor"], "stopOnError=True must hold cursor at unit 0"
        assert after_err["cursorActiveIndex"] == 0

        type_key_stream(page, w0_body)
        after_ok = read_zh_lesson_tokens(page)
        assert after_ok["words"][0]["spaceCursor"] or after_ok["words"][1]["units"][0]["cursor"], (
            f"Expected cursor to advance past w0 after recovery: {after_ok['words'][:2]}"
        )


def t1_f7_02_zh_sp_stop_on_error_false_preserves_hanzi_without_corruption(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        set_typing_options(page, stop_on_error=False, forgive_errors=False, space_skips_words=False)
        save_settings(page)
        focus_zh_input(page)

        before = read_zh_lesson_tokens(page)
        w0 = before["words"][0]
        expected_hanzi = w0["fullHanzi"]
        w0_body = w0["bodyCode"]
        wrong = "x" if w0_body[0] != "x" else "q"

        press_char(page, wrong)
        mid = read_zh_lesson_tokens(page)
        assert mid["words"][0]["fullHanzi"] == expected_hanzi, (
            f"stopOnError=False corrupted Hanzi! expected={expected_hanzi!r}, got={mid['words'][0]['fullHanzi']!r}"
        )

        # Garbage blocks advance until cleared with Backspace when forgiveErrors=False
        page.keyboard.press("Backspace")
        type_key_stream(page, w0_body)
        after = read_zh_lesson_tokens(page)
        assert after["words"][0]["fullHanzi"] == expected_hanzi
        assert after["words"][0]["spaceCursor"] or after["words"][1]["units"][0]["cursor"]


def t1_f7_03_zh_sp_stop_on_error_false_trailing_space_miss_feedback(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        set_typing_options(page, stop_on_error=False, forgive_errors=False, space_skips_words=False)
        save_settings(page)
        focus_zh_input(page)

        before = read_zh_lesson_tokens(page)
        w0 = before["words"][0]
        assert w0["hasSpace"], f"Expected trailing space on word 0: {w0}"
        type_key_stream(page, w0["bodyCode"])
        at_space = read_zh_lesson_tokens(page)
        assert at_space["words"][0]["spaceCursor"], f"Expected cursor on trailing space: {at_space['words'][0]}"

        # Press wrong key on trailing space -> trailing space must visibly render miss/garbage feedback!
        press_char(page, "k")
        err_sp = read_zh_lesson_tokens(page)
        sp_color = err_sp["words"][0]["spaceColor"] or ""
        seg_colors = err_sp["cursorSegColors"]
        assert (COLOR_MISS_RGB in sp_color) or any(COLOR_MISS_RGB in c for c in seg_colors), (
            f"Trailing space miss feedback missing! spaceColor={sp_color!r}, segColors={seg_colors!r}"
        )

        page.keyboard.press("Backspace")
        press_char(page, " ")
        after = read_zh_lesson_tokens(page)
        assert after["words"][1]["units"][0]["cursor"]


def t1_f7_04_zh_sp_space_skips_words_true_advances_to_next_word(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        set_typing_options(page, space_skips_words=True)
        save_settings(page)
        focus_zh_input(page)

        tokens = read_zh_lesson_tokens(page)
        w0_body = tokens["words"][0]["bodyCode"]
        press_char(page, w0_body[0])
        press_char(page, " ")
        after = read_zh_lesson_tokens(page)
        assert after["words"][1]["units"][0]["cursor"], f"Space should skip w0 to w1: {after['words'][:2]}"
        assert after["cursorActiveIndex"] == 0


def t1_f7_05_zh_qp_forgive_errors_true_recovery(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-qp", "keyboard.layout": "zh-qp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        select_zh_scheme(page, r"^(全拼|Full Pinyin)$")
        set_typing_options(page, stop_on_error=False, forgive_errors=True, space_skips_words=False)
        save_settings(page)
        focus_zh_input(page)

        tokens = None
        for _ in range(12):
            tokens = read_zh_lesson_tokens(page)
            if len(tokens["words"][0]["bodyCode"]) >= 4:
                break
            skip_lesson(page)
            focus_zh_input(page)
        assert tokens is not None and len(tokens["words"][0]["bodyCode"]) >= 4, (
            f"Expected Quanpin word >= 4 chars after bounded skips: {tokens['words'][0] if tokens else None}"
        )

        w0 = tokens["words"][0]
        w0_body = w0["bodyCode"]
        expected_hanzi = w0["fullHanzi"]
        wrong = "x" if w0_body[0] != "x" else "q"
        # Replaced-character recovery: wrong + next 3 matching chars (recoverBufferLength=3)
        type_key_stream(page, wrong + w0_body[1:4])
        after = read_zh_lesson_tokens(page)
        assert after["words"][0]["fullHanzi"] == expected_hanzi, (
            f"forgiveErrors recovery corrupted Quanpin Hanzi: expected={expected_hanzi!r}, got={after['words'][0]['fullHanzi']!r}"
        )
        # Cursor should have recovered past position 0..3
        still_at_start = after["words"][0]["units"][0]["cursor"] and after["cursorActiveIndex"] == 0
        assert not still_at_start, f"Expected Quanpin forgiveErrors to recover past start: {after}"


# ===========================================================================
# F8: Chinese Settings Wording 词语 (R8) — 5 tests
# ===========================================================================


def t1_f8_01_zh_settings_repeat_each_word_label_uses_ciyu(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        lbl = page.locator(
            'main fieldset:nth-of-type(1) > div:has(input[type="range"][min="1"][max="10"]) > span:nth-of-type(1)'
        )
        expect(lbl).to_be_visible(timeout=5000)
        txt = (lbl.inner_text() or "").strip()
        assert txt == "重复每个词语：", f"Expected '重复每个词语：', got {txt!r}"
        assert "词语" in txt and "单词" not in txt


def t1_f8_02_zh_settings_repeat_words_description_uses_ciyu(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        fs1_text = page.locator("main fieldset:nth-of-type(1)").inner_text()
        assert "重复每个词语多次" in fs1_text, f"Expected '重复每个词语多次' in fieldset 1: {fs1_text!r}"
        assert "重复每个单词" not in fs1_text


def t1_f8_03_zh_settings_ciyu_wording_in_quanpin_mode(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-qp", "keyboard.layout": "zh-qp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        select_zh_scheme(page, r"^(全拼|Full Pinyin)$")
        lbl = page.locator(
            'main fieldset:nth-of-type(1) > div:has(input[type="range"][min="1"][max="10"]) > span:nth-of-type(1)'
        )
        assert (lbl.inner_text() or "").strip() == "重复每个词语："


def t1_f8_04_zh_settings_ciyu_wording_persists_after_save_and_reopen(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        save_settings(page)
        open_settings(page)
        lbl = page.locator(
            'main fieldset:nth-of-type(1) > div:has(input[type="range"][min="1"][max="10"]) > span:nth-of-type(1)'
        )
        assert (lbl.inner_text() or "").strip() == "重复每个词语："


def t1_f8_05_en_ui_keeps_repeat_each_word_label(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/en", wait_until="domcontentloaded")
        assert get_html_attrs(page)["lang"] == "en"
        ensure_practice_language(page, "zh")
        open_settings(page)
        lbl = page.locator(
            'main fieldset:nth-of-type(1) > div:has(input[type="range"][min="1"][max="10"]) > span:nth-of-type(1)'
        )
        assert (lbl.inner_text() or "").strip() == "Repeat each word:"


@contextlib.contextmanager
def _ensure_empty_keytrace_server(base_url: str) -> Iterator[str]:
    """Reuse base_url when its KeyTrace dir is empty; otherwise spin up a clean isolated server."""
    is_empty = False
    try:
        _, summary = http_get_json(f"{base_url}/_/keytrace/summary?days=1")
        is_empty = not summary.get("status", {}).get("available", False)
    except Exception:  # noqa: BLE001
        is_empty = False
    if is_empty:
        yield base_url
        return
    with run_isolated_server() as (iso_url, _):
        yield iso_url


@contextlib.contextmanager
def _with_synthetic_keytrace_jsonl(
    base_url: str, keytrace_dir: str | None
) -> Iterator[tuple[str, Path]]:
    """Write synthetic .jsonl KeyTrace events into keytrace_dir (or a temp isolated server) and clean up."""
    today_str = time.strftime("%Y-%m-%d", time.localtime())
    now_ms = int(time.time() * 1000) - 30_000
    events = build_realistic_keytrace_events(
        base_ts=now_ms,
        tokens=[
            ("enter ", 240.0, 0),
            ("intent ", 250.0, 0),
            ("entire ", 260.0, 1),
            ("inert ", 245.0, 0),
            ("tenet ", 235.0, 0),
            ("retire ", 255.0, 0),
            ("trite ", 240.0, 0),
        ],
    )
    if keytrace_dir is not None:
        created = write_keytrace_jsonl(Path(keytrace_dir), today_str, events)
        try:
            yield base_url, created
        finally:
            if created.exists():
                created.unlink(missing_ok=True)
    else:
        with run_isolated_server() as (iso_url, iso_kt):
            created = write_keytrace_jsonl(iso_kt, today_str, events)
            try:
                yield iso_url, created
            finally:
                if created.exists():
                    created.unlink(missing_ok=True)


# ===========================================================================
# F9: Standalone ZH 6-Key Progressive Curriculum & Zero-KeyTrace Decoupling — 3 tests
# ===========================================================================


def t1_f9_01_standalone_zh_sp_6key_curriculum_and_zero_keytrace_chrome(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with _ensure_empty_keytrace_server(base_url) as target_url:
        with open_context(
            browser,
            target_url,
            settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
        ) as (_, page, _, _):
            kt_requests: list[str] = []

            def _track_req(req) -> None:
                if "/_/keytrace/" in req.url or "/_/sync/keytrace" in req.url:
                    kt_requests.append(req.url)

            page.on("request", _track_req)
            page.goto(f"{target_url}/", wait_until="domcontentloaded")
            ensure_practice_language(page, "zh")
            page.wait_for_timeout(200)

            ks = read_practice_key_set(page)
            assert ks["unlocked"] == list("iujdgs"), (
                f"Expected zh-sp standalone 6 unlocked keys ['i','u','j','d','g','s'], got {ks['unlocked']}"
            )
            assert len(ks["locked"]) == 20, f"Expected 20 locked keys in zh-sp, got {len(ks['locked'])}"
            assert len(ks["forced"]) == 0, f"Expected 0 forced keys in zh-sp, got {ks['forced']}"

            chrome = count_keytrace_practice_chrome(page)
            assert chrome == {"navLinks": 0, "pillLinks": 0, "pillTexts": 0}, (
                f"Standalone mode must have 0 KeyTrace nav/pill chrome, got {chrome}"
            )

            # Settings in standalone mode hides KeytraceModeProp when no KeyTrace exists
            open_settings(page)
            assert not has_keytrace_mode_setting(page), "KeytraceModeProp should stay hidden in pure standalone mode"
            save_settings(page)

            # /profile hides KeyTraceSyncBar in standalone mode
            page.goto(f"{target_url}/profile", wait_until="domcontentloaded")
            page.locator("main h2").first.wait_for(state="visible", timeout=10000)
            page.wait_for_timeout(200)
            sync_btn = page.locator('main button:has-text("同步日常数据"), main button:has-text("Sync KeyTrace")')
            expect(sync_btn).to_have_count(0)
            assert count_keytrace_practice_chrome(page)["navLinks"] == 0

            assert kt_requests == [], f"Standalone mode must make 0 KeyTrace API requests, saw {kt_requests}"


def t1_f9_02_standalone_zh_qp_6key_curriculum(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with _ensure_empty_keytrace_server(base_url) as target_url:
        with open_context(
            browser,
            target_url,
            settings={"keyboard.language": "zh-qp", "keyboard.layout": "zh-qp"},
        ) as (_, page, _, _):
            kt_requests: list[str] = []
            page.on(
                "request",
                lambda req: kt_requests.append(req.url)
                if ("/_/keytrace/" in req.url or "/_/sync/keytrace" in req.url)
                else None,
            )
            page.goto(f"{target_url}/", wait_until="domcontentloaded")
            ensure_practice_language(page, "zh")
            page.wait_for_timeout(200)

            ks = read_practice_key_set(page)
            assert ks["unlocked"] == list("inagjd"), (
                f"Expected zh-qp standalone 6 unlocked keys ['i','n','a','g','j','d'], got {ks['unlocked']}"
            )
            assert len(ks["locked"]) == 20, f"Expected 20 locked keys in zh-qp, got {len(ks['locked'])}"
            assert len(ks["forced"]) == 0, f"Expected 0 forced keys in zh-qp, got {ks['forced']}"
            assert count_keytrace_practice_chrome(page) == {"navLinks": 0, "pillLinks": 0, "pillTexts": 0}
            assert kt_requests == [], f"Standalone zh-qp must make 0 KeyTrace requests, saw {kt_requests}"


def t1_f9_03_standalone_keytrace_route_renders_disconnected_onboarding_card(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with _ensure_empty_keytrace_server(base_url) as target_url:
        with open_context(
            browser,
            target_url,
            settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
        ) as (_, page, _, _):
            page.goto(f"{target_url}/keytrace", wait_until="domcontentloaded")
            expect(page.locator("main h2", has_text="未检测到本地 KeyTrace 数据")).to_be_visible(timeout=10000)
            expect(page.locator('main button:has-text("重新检测")')).to_be_visible()
            go_btn = page.locator('main button:has-text("前往网页练习")')
            expect(go_btn).to_be_visible()

            page.goto(f"{target_url}/en/keytrace", wait_until="domcontentloaded")
            expect(page.locator("main h2", has_text="Local KeyTrace data not detected")).to_be_visible(timeout=10000)
            expect(page.locator('main button:has-text("Refresh")')).to_be_visible()
            go_en_btn = page.locator('main button:has-text("Go to Practice")')
            expect(go_en_btn).to_be_visible()
            go_en_btn.click()
            wait_for_practice_ready(page)


# ===========================================================================
# F10: KeyTrace Connected / Imported Mode & Standalone Data Isolation — 3 tests
# ===========================================================================


def t1_f10_01_keytrace_connected_unlocks_all_en_and_zh_keys_with_chrome(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with _with_synthetic_keytrace_jsonl(base_url, keytrace_dir) as (target_url, _):
        with open_context(
            browser,
            target_url,
            settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
        ) as (_, page, _, _):
            page.goto(f"{target_url}/", wait_until="domcontentloaded")
            ensure_practice_language(page, "zh")

            zh_ks = read_practice_key_set(page)
            assert len(zh_ks["unlocked"]) == 26, f"Connected KeyTrace ZH must unlock all 26 keys: {zh_ks}"
            assert len(zh_ks["locked"]) == 0, f"Connected KeyTrace ZH must have 0 locked keys: {zh_ks['locked']}"
            assert len(zh_ks["forced"]) == 0, f"Connected KeyTrace ZH must have 0 forced keys: {zh_ks['forced']}"

            # KeyTrace nav link and practice pill must both appear
            expect(page.locator('nav a[href="/keytrace"]')).to_be_visible(timeout=10000)
            expect(page.locator('main a[href="/keytrace"]')).to_be_visible(timeout=10000)

            # Switch to EN -> also 26/26 unlocked, 0 locked, 0 forced
            ensure_practice_language(page, "en")
            en_ks = read_practice_key_set(page)
            assert len(en_ks["unlocked"]) == 26, f"Connected KeyTrace EN must unlock all 26 keys: {en_ks}"
            assert len(en_ks["locked"]) == 0
            assert len(en_ks["forced"]) == 0

            # /profile shows KeyTraceSyncBar
            page.goto(f"{target_url}/profile", wait_until="domcontentloaded")
            sync_btn = page.locator('main button:has-text("同步日常数据"), main button:has-text("Sync KeyTrace")').first
            expect(sync_btn).to_be_visible(timeout=10000)


def t1_f10_02_keytrace_mode_standalone_isolates_data_without_deleting(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    now = int(time.time() * 1000)
    with _with_synthetic_keytrace_jsonl(base_url, keytrace_dir) as (target_url, _):
        with open_context(
            browser,
            target_url,
            settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
        ) as (_, page, _, _):
            page.goto(f"{target_url}/", wait_until="domcontentloaded")
            ensure_practice_language(page, "zh")
            # Seed 2 explicit TextType.KEYTRACE records with fast non-Stage-1 keys (q, w, e, r, t, y)
            kt_seed = [
                make_result_json(
                    "zh-sp",
                    ts=now - 20_000 + idx * 3000,
                    length=60,
                    time_ms=12000,
                    errors=0,
                    mode="keytrace",
                    histogram={cp: (20, 0, 200) for cp in map(ord, "qwerty")},
                )
                for idx in range(2)
            ]
            seed_indexeddb_results(page, kt_seed)
            page.reload(wait_until="domcontentloaded")
            ensure_practice_language(page, "zh")

            # Wait for auto-sync + seeded records to settle
            wait_for_indexeddb_count(page, 2)
            kt_count_before = sum(1 for r in read_indexeddb_results(page) if r.get("m") == "keytrace")
            assert kt_count_before >= 2

            ks_auto = read_practice_key_set(page)
            assert len(ks_auto["unlocked"]) == 26 and len(ks_auto["locked"]) == 0 and len(ks_auto["forced"]) == 0
            expect(page.locator('nav a[href="/keytrace"]')).to_be_visible(timeout=10000)
            metrics_text = page.evaluate(
                """() => {
                    for (const el of document.querySelectorAll('main section > div')) {
                        const t = el.innerText || '';
                        if (t.includes('衡量标准') || t.includes('Metrics')) return t;
                    }
                    return '';
                }"""
            )
            assert "衡量标准" in metrics_text or "Metrics" in metrics_text
            assert "60.0wpm" not in metrics_text and "0.0wpm" in metrics_text, (
                f"TextType.KEYTRACE records must not overwrite top SpeedGauge: {metrics_text}"
            )

            # Toggle keytraceMode "auto" -> "standalone"
            open_settings(page)
            assert has_keytrace_mode_setting(page)
            select_keytrace_mode_setting(page, "standalone")
            save_settings(page)

            ks_standalone = read_practice_key_set(page)
            assert ks_standalone["unlocked"] == list("iujdgs"), (
                f"Standalone isolation must drop back to 6-key iujdgs even with fast KEYTRACE records, got {ks_standalone['unlocked']}"
            )
            assert len(ks_standalone["locked"]) == 20
            assert len(ks_standalone["forced"]) == 0
            assert count_keytrace_practice_chrome(page) == {"navLinks": 0, "pillLinks": 0, "pillTexts": 0}

            # Verify TextType.KEYTRACE records were NOT deleted from IndexedDB
            kt_count_isolated = sum(1 for r in read_indexeddb_results(page) if r.get("m") == "keytrace")
            assert kt_count_isolated == kt_count_before, (
                f"Standalone mode must not delete IndexedDB KEYTRACE records: before={kt_count_before}, after={kt_count_isolated}"
            )

            # Toggle back "standalone" -> "auto": restores 26/26 unlocked immediately without reload
            open_settings(page)
            select_keytrace_mode_setting(page, "auto")
            save_settings(page)

            ks_restored = read_practice_key_set(page)
            assert len(ks_restored["unlocked"]) == 26 and len(ks_restored["locked"]) == 0 and len(ks_restored["forced"]) == 0
            expect(page.locator('nav a[href="/keytrace"]')).to_be_visible(timeout=10000)


def t1_f10_03_imported_keytrace_indexeddb_without_jsonl_unlocks_and_isolates(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    now = int(time.time() * 1000)
    with _ensure_empty_keytrace_server(base_url) as target_url:
        with open_context(
            browser,
            target_url,
            settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
        ) as (_, page, _, _):
            page.goto(f"{target_url}/", wait_until="domcontentloaded")
            seed_indexeddb_results(
                page,
                [
                    make_result_json(
                        "zh-sp",
                        ts=now - 10_000,
                        length=60,
                        time_ms=14000,
                        errors=0,
                        mode="keytrace",
                        histogram={ord("q"): (20, 0, 210), ord("w"): (20, 0, 210), ord("e"): (20, 0, 210)},
                    )
                ],
            )
            page.reload(wait_until="domcontentloaded")
            ensure_practice_language(page, "zh")

            # Imported TextType.KEYTRACE unlocks all 26 keys even without live .jsonl files
            ks = read_practice_key_set(page)
            assert len(ks["unlocked"]) == 26 and len(ks["locked"]) == 0 and len(ks["forced"]) == 0
            # Live monitor chrome remains hidden because keytraceAvailable is false
            assert count_keytrace_practice_chrome(page) == {"navLinks": 0, "pillLinks": 0, "pillTexts": 0}

            open_settings(page)
            assert has_keytrace_mode_setting(page)
            select_keytrace_mode_setting(page, "standalone")
            save_settings(page)

            ks_iso = read_practice_key_set(page)
            assert ks_iso["unlocked"] == list("iujdgs") and len(ks_iso["locked"]) == 20
            assert sum(1 for r in read_indexeddb_results(page) if r.get("m") == "keytrace") == 1

            open_settings(page)
            select_keytrace_mode_setting(page, "auto")
            save_settings(page)
            ks_back = read_practice_key_set(page)
            assert len(ks_back["unlocked"]) == 26 and len(ks_back["locked"]) == 0


# ===========================================================================
# F11: Independent EN / ZH Target Speeds — 2 tests
# ===========================================================================


def t1_f11_01_settings_en_zh_target_speed_defaults_bounds_and_persistence(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")

        # Chinese default: 125 CPM (25 WPM), min 50 CPM (10 WPM)
        open_settings(page)
        zh_ts = read_target_speed_setting(page)
        assert ("中文" in zh_ts["label"]) or ("Chinese" in zh_ts["label"]), f"Expected Chinese target label: {zh_ts}"
        assert zh_ts["min"] == 50, f"Expected ZH min 50 CPM (10 WPM), got {zh_ts}"
        assert zh_ts["valueCpm"] == 125, f"Expected ZH default 125 CPM (25 WPM), got {zh_ts}"
        assert "25" in zh_ts["displayText"], f"Expected 25 WPM display, got {zh_ts}"

        # Set ZH target speed = 20 WPM (100 CPM)
        set_target_speed_setting(page, 100)
        save_settings(page)

        # Toggle to EN -> English default: 175 CPM (35 WPM), min 75 CPM (15 WPM)
        ensure_practice_language(page, "en")
        open_settings(page)
        en_ts = read_target_speed_setting(page)
        assert ("英文" in en_ts["label"]) or ("English" in en_ts["label"]), f"Expected English target label: {en_ts}"
        assert en_ts["min"] == 75, f"Expected EN min 75 CPM (15 WPM), got {en_ts}"
        assert en_ts["valueCpm"] == 175, f"Expected EN default 175 CPM (35 WPM), got {en_ts}"
        assert "35" in en_ts["displayText"], f"Expected 35 WPM display, got {en_ts}"

        # Set EN target speed = 45 WPM (225 CPM)
        set_target_speed_setting(page, 225)
        save_settings(page)

        stored = get_settings_storage(page) or {}
        assert stored.get("lesson.targetSpeed") == 225, f"Unexpected stored EN targetSpeed: {stored}"
        assert stored.get("lesson.zhTargetSpeed") == 100, f"Unexpected stored ZH targetSpeed: {stored}"

        # Reload & verify EN=45 WPM persists, then toggle back to ZH & verify ZH=20 WPM persists
        page.reload(wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        open_settings(page)
        assert read_target_speed_setting(page)["valueCpm"] == 225
        save_settings(page)

        ensure_practice_language(page, "zh")
        open_settings(page)
        zh_after = read_target_speed_setting(page)
        assert zh_after["valueCpm"] == 100 and "20" in zh_after["displayText"], f"ZH speed lost after toggle/reload: {zh_after}"


def t1_f11_02_profile_result_grouper_grades_en_and_zh_against_own_target_speed(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    now = int(time.time() * 1000)
    # 400ms per key = 150 CPM = 30 WPM:
    #   - Against ZH target 20 WPM (100 CPM -> 600ms): 30 WPM >= 20 WPM -> DONE GREEN!
    #   - Against EN target 45 WPM (225 CPM -> 266.7ms): 30 WPM < 45 WPM -> NOT GREEN!
    with open_context(
        browser,
        base_url,
        settings={
            "keyboard.language": "zh-sp",
            "keyboard.layout": "zh-sp",
            "lesson.targetSpeed": 225,
            "lesson.zhTargetSpeed": 100,
        },
    ) as (_, page, _, _):
        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        seed_indexeddb_results(
            page,
            [
                make_result_json(
                    "zh-sp",
                    ts=now - 10_000,
                    length=75,
                    time_ms=30_000,
                    errors=0,
                    histogram={
                        ord("a"): (25, 0, 400),
                        ord("i"): (25, 0, 400),
                        ord("u"): (25, 0, 400),
                    },
                ),
                make_result_json(
                    "en-us",
                    ts=now - 5_000,
                    length=75,
                    time_ms=30_000,
                    errors=0,
                    histogram={
                        ord("a"): (25, 0, 400),
                        ord("e"): (25, 0, 400),
                        ord("n"): (25, 0, 400),
                    },
                ),
            ],
        )
        page.reload(wait_until="domcontentloaded")

        select_profile_grouper(page, layout_pattern=r"小鹤双拼|Xiaohe")
        legend_zh = read_mastery_legend(page)
        tiles_zh = read_mastery_tiles(page)
        assert rgb_close(tiles_zh["A"]["bg"], legend_zh["done"]), (
            f"30 WPM ZH key A must be done green against 20 WPM ZH target: {tiles_zh['A']}"
        )

        select_profile_grouper(page, layout_pattern=r"英语|English")
        legend_en = read_mastery_legend(page)
        tiles_en = read_mastery_tiles(page)
        assert not rgb_close(tiles_en["A"]["bg"], legend_en["done"]), (
            f"30 WPM EN key A must NOT be done green against 45 WPM EN target: {tiles_en['A']}"
        )


# ===========================================================================
# F12: Focus-Key Change Alerts — 2 tests
# ===========================================================================


def t1_f12_01_focus_key_shift_emits_focus_letter_toast_and_reload_switch_silent(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    now = int(time.time() * 1000)
    with _ensure_empty_keytrace_server(base_url) as target_url:
        with open_context(
            browser,
            target_url,
            settings={
                "keyboard.language": "zh-sp",
                "keyboard.layout": "zh-sp",
                "lesson.zhTargetSpeed": 125,
            },
        ) as (_, page, _, _):
            page.goto(f"{target_url}/", wait_until="domcontentloaded")
            # Seed u, j, d, g fast (220ms >= target 480ms), s slow (900ms), i omitted (confidence=0 -> initial focus i).
            seed_indexeddb_results(
                page,
                [
                    make_result_json(
                        "zh-sp",
                        ts=now - 30_000,
                        length=100,
                        time_ms=20_000,
                        errors=0,
                        histogram={
                            ord("u"): (20, 0, 220),
                            ord("j"): (20, 0, 220),
                            ord("d"): (20, 0, 220),
                            ord("g"): (20, 0, 220),
                            ord("s"): (20, 0, 900),
                        },
                    )
                ],
            )
            page.reload(wait_until="domcontentloaded")
            ensure_practice_language(page, "zh")

            # Page reload must stay silent (0 toasts)
            install_toast_recorder(page)
            page.wait_for_timeout(200)
            assert read_recorded_toasts(page) == [], f"Reload should not emit toasts: {read_recorded_toasts(page)}"

            ks_before = read_practice_key_set(page)
            assert ks_before["unlocked"] == list("iujdgs")
            assert ks_before["focusedChar"] == "i", f"Expected initial focus 'i', got {ks_before['focusedChar']}"

            # EN <-> ZH switch must also stay silent
            ensure_practice_language(page, "en")
            ensure_practice_language(page, "zh")
            page.wait_for_timeout(200)
            assert read_recorded_toasts(page) == [], (
                f"EN<->ZH switch must not emit toasts: {read_recorded_toasts(page)}"
            )

            # Complete 1 clean lesson containing 'i' (after index 0 so Histogram.from(steps.slice(1)) records 'i')
            focus_zh_input(page)
            tok = read_zh_lesson_tokens(page)
            for _ in range(5):
                if "i" in tok["fullStream"][1:]:
                    break
                skip_lesson(page)
                focus_zh_input(page)
                tok = read_zh_lesson_tokens(page)
            assert "i" in tok["fullStream"][1:], f"Expected focused key 'i' in lesson stream: {tok['fullStream']}"

            type_key_stream(page, tok["fullStream"], per_key_ms=52.0, min_total_ms=1400.0)
            wait_for_indexeddb_count(page, 2)
            toasts = wait_for_recorded_toast(page, [r"练习键位已切换！|Practice key switched!"])

            ks_after = read_practice_key_set(page)
            assert len(ks_after["unlocked"]) == 6, f"Expected no new unlock when 's' is still weak: {ks_after['unlocked']}"
            assert ks_after["focusedChar"] == "s", f"Expected focus to shift to 's', got {ks_after['focusedChar']}"
            assert not any(re.search(r"解锁了一个新的字母！|New letter unlocked!", t) for t in toasts), (
                f"Focus shift must NOT emit new-letter toast: {toasts}"
            )


def t1_f12_02_unlock_new_key_emits_new_letter_without_duplicate_focus_toast(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    now = int(time.time() * 1000)
    with _ensure_empty_keytrace_server(base_url) as target_url:
        with open_context(
            browser,
            target_url,
            settings={
                "keyboard.language": "zh-sp",
                "keyboard.layout": "zh-sp",
                "lesson.zhTargetSpeed": 125,
            },
        ) as (_, page, _, _):
            page.goto(f"{target_url}/", wait_until="domcontentloaded")
            # Seed u, j, d, g, s all fast (220ms); i omitted -> finishing i fast unlocks 7th key 'v'.
            seed_indexeddb_results(
                page,
                [
                    make_result_json(
                        "zh-sp",
                        ts=now - 30_000,
                        length=100,
                        time_ms=20_000,
                        errors=0,
                        histogram={
                            ord("u"): (20, 0, 220),
                            ord("j"): (20, 0, 220),
                            ord("d"): (20, 0, 220),
                            ord("g"): (20, 0, 220),
                            ord("s"): (20, 0, 220),
                        },
                    )
                ],
            )
            page.reload(wait_until="domcontentloaded")
            ensure_practice_language(page, "zh")

            install_toast_recorder(page)
            page.wait_for_timeout(200)
            assert read_recorded_toasts(page) == []

            ks_before = read_practice_key_set(page)
            assert ks_before["unlocked"] == list("iujdgs")
            assert ks_before["focusedChar"] == "i"

            focus_zh_input(page)
            tok = read_zh_lesson_tokens(page)
            for _ in range(5):
                if "i" in tok["fullStream"][1:]:
                    break
                skip_lesson(page)
                focus_zh_input(page)
                tok = read_zh_lesson_tokens(page)
            assert "i" in tok["fullStream"][1:]

            type_key_stream(page, tok["fullStream"], per_key_ms=52.0, min_total_ms=1400.0)
            wait_for_indexeddb_count(page, 2)
            wait_for_recorded_toast(page, [r"解锁了一个新的字母！|New letter unlocked!"])
            page.wait_for_timeout(250)
            toasts = read_recorded_toasts(page)

            ks_after = read_practice_key_set(page)
            assert ks_after["unlocked"] == list("iujdgsv"), (
                f"Expected 7th key 'v' unlocked, got {ks_after['unlocked']}"
            )
            assert ks_after["focusedChar"] == "v", f"Expected newly unlocked 'v' to be focused: {ks_after}"
            assert not any(re.search(r"练习键位已切换！|Practice key switched!", t) for t in toasts), (
                f"Unlocking a new key must NOT emit a duplicate focus-letter toast: {toasts}"
            )


# ===========================================================================
# F13: Consecutive Error Count Badge (2..10) Near Cursor — 4 tests
# ===========================================================================


def _assert_en_consecutive_error_badge_flow(
    browser: Browser,
    base_url: str,
    *,
    stop_on_error: bool,
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "en")
        open_settings(page)
        set_typing_options(page, stop_on_error=stop_on_error, forgive_errors=False, space_skips_words=False)
        save_settings(page)
        focus_en_input(page)

        lesson_text = read_en_lesson_text(page)
        expected = lesson_text[0]
        wrong = "z" if expected.lower() != "z" else "q"

        # 0 errors initially
        st0 = read_en_cursor_error_state(page)
        assert st0["errorCount"] == 0 and st0["badgeCount"] == 0 and not st0["cursorError"]

        # 1st error: highlights red WITHOUT showing "1" badge
        press_char(page, wrong)
        st1 = read_en_cursor_error_state(page)
        assert st1["errorCount"] == 1, f"Expected errorCount=1, got {st1}"
        assert st1["cursorError"], f"Expected red cursor error on 1st error: {st1}"
        assert "--textinput--miss__color" in st1["cursorColorStyle"], f"Expected miss color style on 1st error: {st1}"
        assert st1["badgeCount"] == 0 and st1["badgeText"] is None, f"1st error must NOT render badge: {st1}"

        # 2nd..10th consecutive errors show "2".."10"
        for n in range(2, 11):
            press_char(page, wrong)
            st = read_en_cursor_error_state(page)
            assert st["errorCount"] == n and st["badgeCount"] == 1 and st["badgeText"] == str(n), (
                f"Expected EN badge '{n}' (stopOnError={stop_on_error}), got {st}"
            )

        # 11th & 12th errors remain capped at "10"
        for _ in range(2):
            press_char(page, wrong)
            st = read_en_cursor_error_state(page)
            assert st["errorCount"] == 10 and st["badgeCount"] == 1 and st["badgeText"] == "10", (
                f"EN badge must cap at '10' (stopOnError={stop_on_error}), got {st}"
            )

        # Backspace decrements: 10 -> 9 -> ... -> 2 -> 1 (hides badge) -> 0 (clears error)
        page.keyboard.press("Backspace")
        st9 = read_en_cursor_error_state(page)
        assert st9["errorCount"] == 9 and st9["badgeText"] == "9", f"Expected Backspace 10->9: {st9}"

        for _ in range(7):
            page.keyboard.press("Backspace")
        st2 = read_en_cursor_error_state(page)
        assert st2["errorCount"] == 2 and st2["badgeText"] == "2", f"Expected decrement to 2: {st2}"

        page.keyboard.press("Backspace")
        st1_bs = read_en_cursor_error_state(page)
        assert st1_bs["errorCount"] == 1 and st1_bs["badgeCount"] == 0 and st1_bs["cursorError"], (
            f"Backspace 2->1 must hide badge while retaining error tint: {st1_bs}"
        )

        if stop_on_error:
            # Re-trigger badge "2", then pressing right key clears badge & advances directly
            press_char(page, wrong)
            assert read_en_cursor_error_state(page)["badgeText"] == "2"
            press_char(page, expected)
            st_clear = read_en_cursor_error_state(page)
            assert st_clear["errorCount"] == 0 and st_clear["badgeCount"] == 0 and not st_clear["cursorError"], (
                f"Right key must clear EN badge & error (stopOnError=True): {st_clear}"
            )
        else:
            # Final Backspace 1->0 clears garbage & error, then right key advances cleanly
            page.keyboard.press("Backspace")
            st_zero = read_en_cursor_error_state(page)
            assert st_zero["errorCount"] == 0 and st_zero["badgeCount"] == 0 and not st_zero["cursorError"], (
                f"Backspace 1->0 must clear EN error (stopOnError=False): {st_zero}"
            )
            press_char(page, expected)
            st_clear = read_en_cursor_error_state(page)
            assert st_clear["errorCount"] == 0 and st_clear["badgeCount"] == 0 and not st_clear["cursorError"]


def _assert_zh_consecutive_error_badge_flow(
    browser: Browser,
    base_url: str,
    *,
    stop_on_error: bool,
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        set_typing_options(page, stop_on_error=stop_on_error, forgive_errors=False, space_skips_words=False)
        save_settings(page)
        focus_zh_input(page)

        tok0 = read_zh_lesson_tokens(page)
        w0 = tok0["words"][0]
        expected_hanzi = w0["fullHanzi"]
        expected = w0["bodyCode"][0]
        wrong = "z" if expected != "z" else "q"

        assert w0["units"][0]["errorCount"] == 0 and w0["units"][0]["badgeText"] is None and not tok0["cursorError"]

        # 1st error: highlights red WITHOUT showing "1" badge
        press_char(page, wrong)
        tok1 = read_zh_lesson_tokens(page)
        u0 = tok1["words"][0]["units"][0]
        assert u0["errorCount"] == 1 and tok1["cursorError"] and tok1["hasMissAnywhere"], (
            f"Expected ZH 1st error red highlight (stopOnError={stop_on_error}): {u0}, cursorError={tok1['cursorError']}"
        )
        assert u0["badgeText"] is None, f"ZH 1st error must NOT show badge '1': {u0}"
        assert tok1["words"][0]["fullHanzi"] == expected_hanzi

        # 2nd..10th consecutive errors show "2".."10"
        for n in range(2, 11):
            press_char(page, wrong)
            tok = read_zh_lesson_tokens(page)
            u = tok["words"][0]["units"][0]
            assert u["errorCount"] == n and u["badgeText"] == str(n), (
                f"Expected ZH badge '{n}' (stopOnError={stop_on_error}), got {u}"
            )

        # 11th & 12th errors remain capped at "10"
        for _ in range(2):
            press_char(page, wrong)
            tok = read_zh_lesson_tokens(page)
            u = tok["words"][0]["units"][0]
            assert u["errorCount"] == 10 and u["badgeText"] == "10", (
                f"ZH badge must cap at '10' (stopOnError={stop_on_error}), got {u}"
            )
            assert tok["words"][0]["fullHanzi"] == expected_hanzi

        # Backspace decrements: 10 -> 9 -> ... -> 2 -> 1 (hides badge)
        page.keyboard.press("Backspace")
        assert read_zh_lesson_tokens(page)["words"][0]["units"][0]["badgeText"] == "9"

        for _ in range(7):
            page.keyboard.press("Backspace")
        assert read_zh_lesson_tokens(page)["words"][0]["units"][0]["badgeText"] == "2"

        page.keyboard.press("Backspace")
        tok_bs1 = read_zh_lesson_tokens(page)
        u_bs1 = tok_bs1["words"][0]["units"][0]
        assert u_bs1["errorCount"] == 1 and u_bs1["badgeText"] is None and tok_bs1["cursorError"], (
            f"ZH Backspace 2->1 must hide badge while retaining error tint: {u_bs1}"
        )

        # Re-trigger badge "2", then press right key -> clears badge & advances active segment
        press_char(page, wrong)
        assert read_zh_lesson_tokens(page)["words"][0]["units"][0]["badgeText"] == "2"
        press_char(page, expected)
        tok_ok = read_zh_lesson_tokens(page)
        u_ok = tok_ok["words"][0]["units"][0]
        assert u_ok["errorCount"] == 0 and u_ok["badgeText"] is None and not tok_ok["cursorError"], (
            f"Right key must clear ZH badge & error (stopOnError={stop_on_error}): {u_ok}"
        )
        assert tok_ok["cursorActiveIndex"] == 1 or not u_ok["cursor"]


def t1_f13_01_en_error_badge_stop_on_error_true(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    _assert_en_consecutive_error_badge_flow(browser, base_url, stop_on_error=True)


def t1_f13_02_en_error_badge_stop_on_error_false(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    _assert_en_consecutive_error_badge_flow(browser, base_url, stop_on_error=False)


def t1_f13_03_zh_error_badge_stop_on_error_true(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    _assert_zh_consecutive_error_badge_flow(browser, base_url, stop_on_error=True)


def t1_f13_04_zh_error_badge_stop_on_error_false(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    _assert_zh_consecutive_error_badge_flow(browser, base_url, stop_on_error=False)


# ===========================================================================
# F14: EN Common Vocabulary & EN/ZH Custom Wordlist + Polyphones — 3 tests
# ===========================================================================


def t1_f14_01_en_guided_excludes_rare_alphabetical_tail_on_z_focus(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    now = int(time.time() * 1000)
    hist = {ord(ch): (25, 0, 180) for ch in "abcdefghijklmnopqrstuvwxy"}
    hist[ord("z")] = (15, 2, 950)

    rare_tail_words = {
        "zonked",
        "fuzzbox",
        "gazebo",
        "kamikaze",
        "ziplock",
        "zirconium",
        "zither",
    }

    with _ensure_empty_keytrace_server(base_url) as target_url:
        with open_context(
            browser,
            target_url,
            settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
        ) as (_, page, _, _):
            page.goto(f"{target_url}/", wait_until="domcontentloaded")
            seed_indexeddb_results(
                page,
                [
                    make_result_json(
                        "en-us",
                        ts=now - 10_000,
                        length=100,
                        time_ms=25_000,
                        errors=2,
                        mode="keytrace",
                        histogram=hist,
                    )
                ],
            )
            page.reload(wait_until="domcontentloaded")
            ensure_practice_language(page, "en")

            ks = read_practice_key_set(page)
            assert len(ks["unlocked"]) == 26, f"Expected all 26 keys unlocked in KeyTrace mode: {ks}"
            assert ks["focusedChar"] == "z", f"Expected slowest key 'z' focused: {ks}"

            observed_words: list[str] = []
            for idx in range(12):
                if idx > 0:
                    skip_lesson(page)
                txt = read_en_lesson_text(page)
                observed_words.extend(w.lower() for w in txt.split() if w.strip())

            z_words = [w for w in observed_words if "z" in w]
            assert len(z_words) > 0, f"Expected words targeting weak key 'z' across 12 lessons: {observed_words[:30]}"
            rare_hits = sorted(set(observed_words) & rare_tail_words)
            assert not rare_hits, f"Unexpected rare alphabetical tail words in EN guided lessons: {rare_hits}"


def _open_custom_text_tab(page: Page) -> None:
    main = page.locator("main")
    main.get_by_text(re.compile(r"^(自定义文本|Custom text)$")).first.click()
    main.locator("fieldset:nth-of-type(1) textarea").first.wait_for(state="visible", timeout=10000)


def t1_f14_02_custom_text_zh_polyphone_review_inline_pin_and_tolerance(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")

        # Layer 1 & 2: auto-disambiguation + clickable polyphone pill cycles & rewrites inline annotation.
        open_settings(page)
        _open_custom_text_tab(page)
        fs1 = page.locator("main fieldset:nth-of-type(1)").first
        ta = fs1.locator("textarea").first
        ta.fill("银行行长")

        review = fs1.locator('[data-polyphone-review="1"]')
        review.wait_for(state="visible", timeout=10000)
        first_hang = fs1.locator('[data-polyphone-pill="1"][data-hanzi="行"]').first
        expect(first_hang).to_have_attribute("data-reading", "hang")
        first_hang.click()

        expect(ta).to_have_value("银行(heng)行长")
        updated_hang = fs1.locator('[data-polyphone-pill="1"][data-hanzi="行"]').first
        expect(updated_hang).to_have_attribute("data-reading", "heng")
        expect(updated_hang).to_have_attribute("data-pinned", "1")

        save_settings(page)
        tok_pinned = read_zh_lesson_tokens(page)
        w0 = tok_pinned["words"][0]
        assert "(" not in w0["fullHanzi"] and "heng" not in w0["fullHanzi"], (
            f"Practice display must strip inline (pinyin) annotations: {w0['fullHanzi']}"
        )
        assert w0["fullHanzi"].startswith("银行行长"), f"Unexpected ZH custom text rendered: {w0}"
        assert w0["units"][0]["hanzi"] == "银" and w0["units"][0]["code"] == "yb", w0["units"][0]
        assert w0["units"][1]["hanzi"] == "行" and w0["units"][1]["code"] == "hg", (
            f"Expected pinned 'heng' -> Xiaohe 'hg': {w0['units'][1]}"
        )

        # Layer 3: zhPolyphoneTolerance OFF rejects alternate reading, ON dynamically switches unit.
        open_settings(page)
        fs1 = page.locator("main fieldset:nth-of-type(1)").first
        fs1.locator("textarea").first.fill("长大")
        tolerance_label = fs1.get_by_text(re.compile(r"多音字宽容判定|Allow any valid polyphone reading")).first
        tolerance_checkbox = tolerance_label.locator("xpath=ancestor::label[1]//input[@type='checkbox']")
        if tolerance_checkbox.count() > 0 and tolerance_checkbox.is_checked():
            tolerance_label.click()
        save_settings(page)

        focus_zh_input(page)
        tok_strict = read_zh_lesson_tokens(page)
        u_chang = tok_strict["words"][0]["units"][0]
        assert u_chang["hanzi"] == "长" and u_chang["code"] == "vh", f"Expected 'zhang' -> 'vh': {u_chang}"
        press_char(page, "i")
        tok_err = read_zh_lesson_tokens(page)
        assert tok_err["words"][0]["units"][0]["errorCount"] == 1 and tok_err["cursorError"], (
            f"Tolerance OFF must reject alternate 'chang' first key 'i': {tok_err}"
        )

        open_settings(page)
        fs1 = page.locator("main fieldset:nth-of-type(1)").first
        tolerance_label = fs1.get_by_text(re.compile(r"多音字宽容判定|Allow any valid polyphone reading")).first
        tolerance_label.click()
        save_settings(page)

        focus_zh_input(page)
        tok_tol_before = read_zh_lesson_tokens(page)
        assert tok_tol_before["words"][0]["units"][0]["code"] == "vh"
        press_char(page, "i")
        tok_tol_mid = read_zh_lesson_tokens(page)
        u_switched = tok_tol_mid["words"][0]["units"][0]
        assert u_switched["errorCount"] == 0 and u_switched["code"] == "ih", (
            f"Tolerance ON must accept 'i' and switch '长' to 'ih' ('chang'): {u_switched}"
        )
        type_key_stream(page, "hda")
        tok_tol_after = read_zh_lesson_tokens(page)
        assert not tok_tol_after["cursorError"] and not tok_tol_after["hasMissAnywhere"], (
            f"Completing '长大' via alternate reading 'ihda' must finish cleanly: {tok_tol_after}"
        )

        stored = get_settings_storage(page) or {}
        assert stored.get("lesson.type") == "custom"
        assert stored.get("lesson.customText.zhContent") == "长大"
        assert stored.get("lesson.customText.zhPolyphoneTolerance") is True


def t1_f14_03_custom_text_en_zh_isolation_and_unlocked_indicator(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "en")

        open_settings(page)
        main = page.locator("main")
        # Streamlined 2-tab lesson settings: only Guided lessons + Custom text exist.
        assert main.get_by_text(re.compile(r"^(引导课程|Guided lessons)$")).count() == 1, (
            f"Expected 1 Guided lessons tab, main text={main.inner_text()!r}"
        )
        assert main.get_by_text(re.compile(r"^(自定义文本|Custom text)$")).count() == 1, (
            f"Expected 1 Custom text tab, main text={main.inner_text()!r}"
        )
        for removed in [r"^(单词表|Word list)$", r"^(书籍|Books)$", r"^(代码|Code)$", r"^(数字|Numbers)$"]:
            assert main.get_by_text(re.compile(removed)).count() == 0, f"Unexpected removed tab matching {removed}"

        _open_custom_text_tab(page)
        fs1 = page.locator("main fieldset:nth-of-type(1)").first
        assert fs1.get_by_text(re.compile(r"所有字词[:：]|All words[:：]")).count() >= 1, (
            f"Missing All words stat in EN Custom text: {fs1.inner_text()!r}"
        )
        assert fs1.get_by_text(re.compile(r"转换为小写|Transform to lowercase")).count() == 1, (
            f"Missing Transform to lowercase in EN Custom text: {fs1.inner_text()!r}"
        )
        assert fs1.locator('[data-polyphone-review="1"]').count() == 0, "Unexpected ZH polyphone review in EN mode"
        assert fs1.get_by_text(re.compile(r"多音字宽容判定|Allow any valid polyphone reading")).count() == 0, (
            "Unexpected ZH polyphone tolerance toggle in EN mode"
        )

        en_custom = "alpha beta gamma"
        fs1.locator("textarea").first.fill(en_custom)
        save_settings(page)

        en_text = read_en_lesson_text(page)
        assert "alpha" in en_text and "beta" in en_text and "gamma" in en_text, en_text
        expect(page.locator("main section").first).to_contain_text(
            re.compile(r"All keys are unlocked\.|所有键位已解锁。")
        )

        # Switching to ZH keeps EN text isolated and shows separate ZH editor & polyphone UI.
        ensure_practice_language(page, "zh")
        open_settings(page)
        fs1 = page.locator("main fieldset:nth-of-type(1)").first
        zh_ta = fs1.locator("textarea").first
        assert zh_ta.input_value() != en_custom, "ZH custom text editor must not show EN custom text"
        assert fs1.get_by_text(re.compile(r"汉字数[:：]|Hanzi count[:：]")).count() >= 1, (
            f"Missing Hanzi count stat in ZH Custom text: {fs1.inner_text()!r}"
        )
        assert fs1.get_by_text(re.compile(r"转换为小写|Transform to lowercase")).count() == 0, (
            "Unexpected EN lowercase option in ZH Custom text"
        )
        assert fs1.get_by_text(re.compile(r"多音字宽容判定|Allow any valid polyphone reading")).count() == 1, (
            f"Missing ZH polyphone tolerance option: {fs1.inner_text()!r}"
        )

        zh_custom = "重庆银行"
        zh_ta.fill(zh_custom)
        fs1.locator('[data-polyphone-review="1"]').wait_for(state="visible", timeout=10000)
        save_settings(page)

        tok_zh = read_zh_lesson_tokens(page)
        assert tok_zh["words"][0]["fullHanzi"].startswith(zh_custom), tok_zh["words"][0]
        expect(page.locator("main section").first).to_contain_text(
            re.compile(r"All keys are unlocked\.|所有键位已解锁。")
        )

        # Switching back to EN preserves EN custom words and independent storage.
        ensure_practice_language(page, "en")
        en_text_again = read_en_lesson_text(page)
        assert "alpha" in en_text_again and "beta" in en_text_again, en_text_again

        stored = get_settings_storage(page) or {}
        assert stored.get("lesson.customText.content") == en_custom
        assert stored.get("lesson.customText.zhContent") == zh_custom


def _assert_zh_unfocused_blur_state(page: Page) -> None:
    board = page.locator("main [data-zh-board='1']").first
    board.wait_for(state="visible", timeout=10000)
    board_styles = board.evaluate(
        "el => { const cs = window.getComputedStyle(el); return { filter: cs.filter, isolation: cs.isolation }; }"
    )
    assert "blur(3px)" in (board_styles["filter"] or ""), f"Expected blur(3px) when unfocused: {board_styles}"
    assert board_styles["isolation"] == "isolate", f"Expected isolation=isolate on zh board: {board_styles}"
    assert page.locator("main [data-caret-shape]").count() == 0, "Caret must be hidden when ZH input is unfocused"

    toggle_filter = page.locator("main [data-scheme] label").first.evaluate(
        "el => window.getComputedStyle(el).filter"
    )
    assert toggle_filter == "none", f"Expected sharp toggle label filter='none', got {toggle_filter!r}"

    prompt = page.locator("main").get_by_text(
        re.compile(r"单击或按 Enter 键激活|Click or press Enter to activate")
    )
    expect(prompt).to_be_visible(timeout=5000)

    # Activation overlay must sit above ZhLines (positive z-index over the isolated board).
    overlay_z = prompt.evaluate("el => window.getComputedStyle(el.parentElement).zIndex")
    assert overlay_z == "1", f"Expected activation overlay zIndex='1', got {overlay_z!r}"


def _assert_zh_focused_sharp_state(page: Page) -> None:
    board = page.locator("main [data-zh-board='1']").first
    board.wait_for(state="visible", timeout=10000)
    assert board.evaluate("el => window.getComputedStyle(el).filter") == "none"
    expect(page.locator("main [data-caret-shape]").first).to_be_visible(timeout=5000)
    assert (
        page.locator("main")
        .get_by_text(re.compile(r"单击或按 Enter 键激活|Click or press Enter to activate"))
        .count()
        == 0
    )


def t1_f14_04_zh_unfocused_blur_hides_caret_and_clears_on_focus(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")

        # 1) Initial mount auto-focuses TextEvents -> sharp board + caret visible.
        _assert_zh_focused_sharp_state(page)

        # 2) Blurring ZH input applies blur(3px), hides caret, keeps toggle sharp, shows activation prompt above board.
        page.locator('main [role="textbox"]').first.evaluate("el => el.blur()")
        _assert_zh_unfocused_blur_state(page)

        # 3) Clicking hanzi re-focuses, clears blur, reveals caret, and hides activation prompt.
        focus_zh_input(page)
        _assert_zh_focused_sharp_state(page)

        # 4) Pressing Enter after blur also re-activates cleanly.
        page.locator('main [role="textbox"]').first.evaluate("el => el.blur()")
        _assert_zh_unfocused_blur_state(page)
        page.keyboard.press("Enter")
        _assert_zh_focused_sharp_state(page)

        # 5) Verify Full Pinyin (zh-qp) also blurs when unfocused and clears cleanly on focus.
        open_settings(page)
        select_zh_scheme(page, r"^(全拼|Full Pinyin)$")
        save_settings(page)
        page.locator('main [role="textbox"]').first.evaluate("el => el.blur()")
        _assert_zh_unfocused_blur_state(page)

        focus_zh_input(page)
        _assert_zh_focused_sharp_state(page)


def t1_f14_05_time_decay_mastery_recovery_and_v5_keytrace_calibration(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    today_str = time.strftime("%Y-%m-%d", time.localtime())
    now_ms = int(time.time() * 1000) - 30_000
    created_file = None
    if keytrace_dir is not None:
        # Build KeyTrace events with an 800ms post-Space pause before 'q' (+150ms fluent keys after):
        # v5 parser must exclude the >600ms post-Space thinking pause and return syncVersion=5.
        session_start = now_ms - 1000
        events: list[dict[str, object]] = [
            {
                "v": 1,
                "ev": "meta",
                "ts": session_start,
                "mono": 100.0,
                "sid": 1,
                "sessionStartTs": session_start,
                "exe": "notepad.exe",
                "text": "ime=shuangpin/xiaohe",
            }
        ]
        seq = [
            (72, 1000),  # h
            (65, 1150),  # a
            (79, 1300),  # o
            (32, 1450),  # Space boundary
            (81, 2250),  # q (+800ms post-Space pause -> dropped!)
            (73, 2400),  # i (+150ms fluent)
            (78, 2550),  # n (+150ms fluent)
            (71, 2700),  # g (+150ms fluent)
            (81, 2850),  # q (+150ms fluent)
            (73, 3000),  # i (+150ms fluent)
            (84, 3150),  # t (+150ms fluent)
            (73, 3300),  # i (+150ms fluent)
        ]
        for idx, (vk, mono) in enumerate(seq):
            events.append(
                {
                    "v": 1,
                    "ev": "kd",
                    "ts": now_ms + idx * 150,
                    "mono": mono,
                    "sid": 1,
                    "sessionStartTs": session_start,
                    "exe": "notepad.exe",
                    "sc": 30,
                    "vk": vk,
                    "mods": 0,
                }
            )
        events.append(
            {
                "v": 1,
                "ev": "commit",
                "ts": now_ms + 4000,
                "mono": 3400.0,
                "sid": 1,
                "sessionStartTs": session_start,
                "exe": "notepad.exe",
                "text": "好心情其提",
                "keys": len(seq),
            }
        )
        created_file = write_keytrace_jsonl(Path(keytrace_dir), today_str, events)

    try:
        if created_file is not None:
            status_sync, sync_json = http_get_json(f"{base_url}/_/sync/keytrace?since=0&migrate=1")
            assert status_sync == 200 and sync_json.get("syncVersion") == 5, sync_json
            zh_recs = [r for r in sync_json.get("records", []) if r.get("l") == "zh-sp"]
            assert len(zh_recs) >= 1, sync_json
            q_stat = zh_recs[-1]["h"].get(str(ord("q")))
            assert q_stat is not None and q_stat["t"] == 150, f"Expected post-space 800ms dropped, got {q_stat}"

        # Seed 21-day-old high-error slow KeyTrace zh-sp history + recent clean web practice -> tile 'T' recovers green!
        old_ts = now_ms - 21 * 86_400_000
        old_kt = make_result_json(
            "zh-sp",
            ts=old_ts,
            length=200,
            time_ms=100_000,
            errors=40,
            histogram={
                ord("i"): (60, 0, 200),
                ord("u"): (60, 0, 200),
                ord("t"): (200, 40, 700),
            },
            mode="keytrace",
        )
        clean_sessions = [
            make_result_json(
                "zh-sp",
                ts=now_ms - (6 - i) * 60_000,
                length=60,
                time_ms=10_000,
                errors=0,
                histogram={
                    ord("i"): (20, 0, 180),
                    ord("u"): (20, 0, 180),
                    ord("t"): (25, 0, 150),
                },
                mode="generated",
            )
            for i in range(6)
        ]

        with open_context(
            browser,
            base_url,
            settings={
                "keyboard.language": "zh-sp",
                "keyboard.layout": "zh-sp",
                "lesson.zhTargetSpeed": 175,
                "lesson.keytraceMode": "standalone",
            },
        ) as (_, page, _, _):
            page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
            seed_indexeddb_results(page, [old_kt, *clean_sessions])
            page.reload(wait_until="domcontentloaded")

            tiles = read_mastery_tiles(page)
            legend = read_mastery_legend(page)
            assert rgb_close(tiles["T"]["bg"], legend["done"]), (
                f"Expected T mastery to recover green after 21d decay + clean sessions: tiles[T]={tiles['T']}, legend={legend}"
            )
    finally:
        if created_file is not None and created_file.exists():
            created_file.unlink(missing_ok=True)


TIER1_TESTS: list[tuple[str, Callable[..., None]]] = [
    ("t1_f1_01_profile_high_error_fast_key_not_green", t1_f1_01_profile_high_error_fast_key_not_green),
    ("t1_f1_02_profile_low_sample_fast_key_not_green", t1_f1_02_profile_low_sample_fast_key_not_green),
    ("t1_f1_03_profile_zh_realtime_mastery_regression_not_green", t1_f1_03_profile_zh_realtime_mastery_regression_not_green),
    ("t1_f1_04_profile_summary_stats_reflect_seeded_sessions", t1_f1_04_profile_summary_stats_reflect_seeded_sessions),
    ("t1_f1_05_profile_keytrace_sync_ingests_realistic_jsonl", t1_f1_05_profile_keytrace_sync_ingests_realistic_jsonl),
    ("t1_f2_01_zh_to_en_toggle_layout_shift_le_1px", t1_f2_01_zh_to_en_toggle_layout_shift_le_1px),
    ("t1_f2_02_en_to_zh_toggle_layout_shift_le_1px", t1_f2_02_en_to_zh_toggle_layout_shift_le_1px),
    ("t1_f2_03_zh_en_toggle_no_zero_height_loading_collapse", t1_f2_03_zh_en_toggle_no_zero_height_loading_collapse),
    ("t1_f2_04_zh_to_en_to_zh_roundtrip_controls_and_buttons_stable", t1_f2_04_zh_to_en_to_zh_roundtrip_controls_and_buttons_stable),
    ("t1_f2_05_en_ui_zh_en_toggle_layout_shift_le_1px", t1_f2_05_en_ui_zh_en_toggle_layout_shift_le_1px),
    ("t1_f3_01_compact_view_reset_and_restore_via_close_x", t1_f3_01_compact_view_reset_and_restore_via_close_x),
    ("t1_f3_02_bare_view_reset_and_restore_via_finish_close", t1_f3_02_bare_view_reset_and_restore_via_finish_close),
    ("t1_f3_03_zoomer_suspended_during_tour_and_restored_without_overwriting_storage", t1_f3_03_zoomer_suspended_during_tour_and_restored_without_overwriting_storage),
    ("t1_f3_04_scroll_position_reset_to_top_and_restored_after_tour", t1_f3_04_scroll_position_reset_to_top_and_restored_after_tour),
    ("t1_f3_05_spotlight_and_popup_alignment_all_anchored_slides", t1_f3_05_spotlight_and_popup_alignment_all_anchored_slides),
    ("t1_f4_01_nav_contains_github_repo_link", t1_f4_01_nav_contains_github_repo_link),
    ("t1_f4_02_nav_github_link_present_on_profile_and_keytrace", t1_f4_02_nav_github_link_present_on_profile_and_keytrace),
    ("t1_f4_03_nav_github_link_present_on_en_routes", t1_f4_03_nav_github_link_present_on_en_routes),
    ("t1_f4_04_nav_github_link_accessible_and_visible_in_both_themes", t1_f4_04_nav_github_link_accessible_and_visible_in_both_themes),
    ("t1_f4_05_nav_github_link_opens_target_href", t1_f4_05_nav_github_link_opens_target_href),
    ("t1_f5_01_light_to_dark_direct_toggle_updates_attr_and_cookie", t1_f5_01_light_to_dark_direct_toggle_updates_attr_and_cookie),
    ("t1_f5_02_dark_to_light_no_popover_menu_or_designer_dialog", t1_f5_02_dark_to_light_no_popover_menu_or_designer_dialog),
    ("t1_f5_03_theme_toggle_persists_across_reload", t1_f5_03_theme_toggle_persists_across_reload),
    ("t1_f5_04_theme_toggle_changes_computed_background_brightness", t1_f5_04_theme_toggle_changes_computed_background_brightness),
    ("t1_f5_05_system_initial_theme_toggles_cleanly_to_opposite", t1_f5_05_system_initial_theme_toggles_cleanly_to_opposite),
    ("t1_f6_01_toolbar_has_only_two_buttons_no_font_button", t1_f6_01_toolbar_has_only_two_buttons_no_font_button),
    ("t1_f6_02_toolbar_has_two_buttons_on_en_and_profile", t1_f6_02_toolbar_has_two_buttons_on_en_and_profile),
    ("t1_f6_03_settings_font_selector_changes_zh_hanzi_font", t1_f6_03_settings_font_selector_changes_zh_hanzi_font),
    ("t1_f6_04_settings_font_selector_changes_en_text_font", t1_f6_04_settings_font_selector_changes_en_text_font),
    ("t1_f6_05_settings_font_persists_across_reload", t1_f6_05_settings_font_persists_across_reload),
    ("t1_f7_01_zh_sp_stop_on_error_true_halts_cursor_and_recovers", t1_f7_01_zh_sp_stop_on_error_true_halts_cursor_and_recovers),
    ("t1_f7_02_zh_sp_stop_on_error_false_preserves_hanzi_without_corruption", t1_f7_02_zh_sp_stop_on_error_false_preserves_hanzi_without_corruption),
    ("t1_f7_03_zh_sp_stop_on_error_false_trailing_space_miss_feedback", t1_f7_03_zh_sp_stop_on_error_false_trailing_space_miss_feedback),
    ("t1_f7_04_zh_sp_space_skips_words_true_advances_to_next_word", t1_f7_04_zh_sp_space_skips_words_true_advances_to_next_word),
    ("t1_f7_05_zh_qp_forgive_errors_true_recovery", t1_f7_05_zh_qp_forgive_errors_true_recovery),
    ("t1_f8_01_zh_settings_repeat_each_word_label_uses_ciyu", t1_f8_01_zh_settings_repeat_each_word_label_uses_ciyu),
    ("t1_f8_02_zh_settings_repeat_words_description_uses_ciyu", t1_f8_02_zh_settings_repeat_words_description_uses_ciyu),
    ("t1_f8_03_zh_settings_ciyu_wording_in_quanpin_mode", t1_f8_03_zh_settings_ciyu_wording_in_quanpin_mode),
    ("t1_f8_04_zh_settings_ciyu_wording_persists_after_save_and_reopen", t1_f8_04_zh_settings_ciyu_wording_persists_after_save_and_reopen),
    ("t1_f8_05_en_ui_keeps_repeat_each_word_label", t1_f8_05_en_ui_keeps_repeat_each_word_label),
    ("t1_f9_01_standalone_zh_sp_6key_curriculum_and_zero_keytrace_chrome", t1_f9_01_standalone_zh_sp_6key_curriculum_and_zero_keytrace_chrome),
    ("t1_f9_02_standalone_zh_qp_6key_curriculum", t1_f9_02_standalone_zh_qp_6key_curriculum),
    ("t1_f9_03_standalone_keytrace_route_renders_disconnected_onboarding_card", t1_f9_03_standalone_keytrace_route_renders_disconnected_onboarding_card),
    ("t1_f10_01_keytrace_connected_unlocks_all_en_and_zh_keys_with_chrome", t1_f10_01_keytrace_connected_unlocks_all_en_and_zh_keys_with_chrome),
    ("t1_f10_02_keytrace_mode_standalone_isolates_data_without_deleting", t1_f10_02_keytrace_mode_standalone_isolates_data_without_deleting),
    ("t1_f10_03_imported_keytrace_indexeddb_without_jsonl_unlocks_and_isolates", t1_f10_03_imported_keytrace_indexeddb_without_jsonl_unlocks_and_isolates),
    ("t1_f11_01_settings_en_zh_target_speed_defaults_bounds_and_persistence", t1_f11_01_settings_en_zh_target_speed_defaults_bounds_and_persistence),
    ("t1_f11_02_profile_result_grouper_grades_en_and_zh_against_own_target_speed", t1_f11_02_profile_result_grouper_grades_en_and_zh_against_own_target_speed),
    ("t1_f12_01_focus_key_shift_emits_focus_letter_toast_and_reload_switch_silent", t1_f12_01_focus_key_shift_emits_focus_letter_toast_and_reload_switch_silent),
    ("t1_f12_02_unlock_new_key_emits_new_letter_without_duplicate_focus_toast", t1_f12_02_unlock_new_key_emits_new_letter_without_duplicate_focus_toast),
    ("t1_f13_01_en_error_badge_stop_on_error_true", t1_f13_01_en_error_badge_stop_on_error_true),
    ("t1_f13_02_en_error_badge_stop_on_error_false", t1_f13_02_en_error_badge_stop_on_error_false),
    ("t1_f13_03_zh_error_badge_stop_on_error_true", t1_f13_03_zh_error_badge_stop_on_error_true),
    ("t1_f13_04_zh_error_badge_stop_on_error_false", t1_f13_04_zh_error_badge_stop_on_error_false),
    (
        "t1_f14_01_en_guided_excludes_rare_alphabetical_tail_on_z_focus",
        t1_f14_01_en_guided_excludes_rare_alphabetical_tail_on_z_focus,
    ),
    (
        "t1_f14_02_custom_text_zh_polyphone_review_inline_pin_and_tolerance",
        t1_f14_02_custom_text_zh_polyphone_review_inline_pin_and_tolerance,
    ),
    (
        "t1_f14_03_custom_text_en_zh_isolation_and_unlocked_indicator",
        t1_f14_03_custom_text_en_zh_isolation_and_unlocked_indicator,
    ),
    (
        "t1_f14_04_zh_unfocused_blur_hides_caret_and_clears_on_focus",
        t1_f14_04_zh_unfocused_blur_hides_caret_and_clears_on_focus,
    ),
    (
        "t1_f14_05_time_decay_mastery_recovery_and_v5_keytrace_calibration",
        t1_f14_05_time_decay_mastery_recovery_and_v5_keytrace_calibration,
    ),
]

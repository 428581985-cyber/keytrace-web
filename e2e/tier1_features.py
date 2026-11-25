from __future__ import annotations

import re
import time
from typing import Callable

from playwright.sync_api import Browser, expect

from harness import (
    COLOR_HIT_RGB,
    COLOR_MISS_RGB,
    GITHUB_URL,
    VIEW_BARE,
    VIEW_COMPACT,
    VIEW_NORMAL,
    build_realistic_keytrace_events,
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
    http_get_json,
    is_tour_open,
    make_result_json,
    max_box_delta,
    measure_practice_boxes,
    measure_tour_spotlight_and_anchor,
    open_context,
    open_settings,
    press_char,
    read_key_selector_tiles,
    read_mastery_legend,
    read_mastery_tiles,
    read_summary_stats,
    read_zh_lesson_tokens,
    read_zoomer_styles,
    rgb_brightness,
    rgb_close,
    save_settings,
    seed_indexeddb_results,
    select_profile_grouper,
    select_settings_font,
    select_zh_scheme,
    set_typing_options,
    skip_lesson,
    type_key_stream,
    wait_for_practice_ready,
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
        delta = max_box_delta(before, after)
        assert delta <= 1.0, f"ZH->EN layout shift {delta:.2f}px > 1.0px (before={before}, after={after})"


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
        delta = max_box_delta(before, after)
        assert delta <= 1.0, f"EN->ZH layout shift {delta:.2f}px > 1.0px (before={before}, after={after})"


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
        delta = max_box_delta(before, after)
        assert delta <= 1.0, f"Roundtrip shift {delta:.2f}px > 1.0px"


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
        assert max_box_delta(b0, b1, ("controls", "zhBtn", "enBtn", "indicators", "keyboard")) <= 1.0
        assert max_box_delta(b0, b2) <= 1.0


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
        delta = max_box_delta(before, after)
        assert delta <= 1.0, f"EN-UI EN->ZH layout shift {delta:.2f}px > 1.0px"


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
        viewport={"width": 1280, "height": 620},
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        page.evaluate("() => window.scrollTo(0, 240)")
        page.wait_for_timeout(80)
        pre_scroll = page.evaluate("() => window.scrollY")
        assert pre_scroll > 40, f"Expected scrollable viewport on 1280x620, got scrollY={pre_scroll}"

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
]

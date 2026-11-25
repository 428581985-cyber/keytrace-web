from __future__ import annotations

import time
from pathlib import Path
from typing import Callable

from playwright.sync_api import Browser, expect

from harness import (
    GITHUB_URL,
    VIEW_COMPACT,
    VIEW_NORMAL,
    build_realistic_keytrace_events,
    dismiss_tour_if_open,
    ensure_practice_language,
    focus_zh_input,
    get_help_button,
    get_html_attrs,
    get_practice_view,
    get_theme_button,
    get_toolbar_buttons,
    get_view_switch_button,
    get_zoomer_positions,
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
    rgb_close,
    save_settings,
    seed_indexeddb_results,
    select_profile_grouper,
    select_settings_font,
    select_zh_scheme,
    set_fuzzy_options,
    set_typing_options,
    skip_lesson,
    type_key_stream,
    wait_for_indexeddb_count,
    wait_for_practice_ready,
    write_keytrace_jsonl,
)


def t4_01_daily_zh_shuangpin_user_session_settings_to_profile(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    """Scenario 1 (F1, F5, F7, F8): Fresh visit -> dismiss tour -> dark mode -> Settings 词语 + options -> live lesson -> /profile."""
    with open_context(
        browser,
        base_url,
        prefs_cookie={"color": "light", "font": "open-sans"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        dismiss_tour_if_open(page)

        get_theme_button(page).click()
        expect(page.locator("html")).to_have_attribute("data-color", "dark")

        ensure_practice_language(page, "zh")
        open_settings(page)
        lbl = page.locator("main fieldset:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1)")
        assert (lbl.inner_text() or "").strip() == "重复每个词语："
        set_typing_options(page, stop_on_error=False, forgive_errors=False, space_skips_words=True)
        save_settings(page)
        focus_zh_input(page)

        tok = read_zh_lesson_tokens(page)
        stream = tok["fullStream"]
        assert len(stream) >= 20
        # Inject error on stream[1] (steps[1], since steps[0] is ignored by makeStats!)
        err_char = stream[1]
        assert err_char.isalpha(), f"Expected letter at stream[1], got {stream[:6]!r}"
        wrong = "x" if err_char != "x" else "q"
        press_char(page, stream[0])
        press_char(page, wrong)
        page.keyboard.press("Backspace")
        time.sleep(0.06)
        type_key_stream(page, stream[1:], per_key_ms=52.0, min_total_ms=1400.0)

        recs = wait_for_indexeddb_count(page, 1)
        assert len(recs) >= 1

        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        stats = read_summary_stats(page, r"总统计数据|All Time Statistics")
        assert int(stats.get("字符") or stats.get("Characters") or "0") >= 20, f"Expected recorded characters in summary: {stats}"
        legend = read_mastery_legend(page)
        tiles = read_mastery_tiles(page)
        assert not rgb_close(tiles[err_char.upper()]["bg"], legend["done"])


def t4_02_bilingual_learner_font_and_layout_stability_across_views(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    """Scenario 2 (F2, F6, F8): Bilingual toggle across Normal & Compact views + Settings font change."""
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
        practice_view=VIEW_NORMAL,
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")

        open_settings(page)
        lbl = page.locator("main fieldset:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1)")
        assert (lbl.inner_text() or "").strip() == "重复每个词语："
        select_settings_font(page, r"^楷体$")
        save_settings(page)

        # Normal view ZH <-> EN stability
        b_norm_0 = measure_practice_boxes(page)
        ensure_practice_language(page, "en")
        b_norm_1 = measure_practice_boxes(page)
        assert max_box_delta(b_norm_0, b_norm_1) <= 1.0

        # Switch to Compact view and verify stability + font
        ensure_practice_language(page, "zh")
        get_view_switch_button(page).click()
        assert get_practice_view(page) == VIEW_COMPACT

        b_cmp_0 = measure_practice_boxes(page)
        ensure_practice_language(page, "en")
        b_cmp_1 = measure_practice_boxes(page)
        assert max_box_delta(b_cmp_0, b_cmp_1, ("main", "controls", "indicators", "textArea", "zhBtn", "enBtn")) <= 1.0

        ensure_practice_language(page, "zh")
        ff = read_zh_lesson_tokens(page)["words"][0]["units"][0]["fontFamily"] or ""
        assert "KaiTi" in ff


def t4_03_customized_workspace_full_12_slide_tour_and_resume_typing(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    """Scenario 3 (F3, F7): Live wheel+drag Zoomer on Compact view -> 12-slide Help tour -> Close -> resume typing."""
    with open_context(
        browser,
        base_url,
        viewport={"width": 1280, "height": 680},
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
        practice_view=VIEW_COMPACT,
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        assert get_practice_view(page) == VIEW_COMPACT

        # Wheel & drag Indicators/Compact Zoomer live
        ind_label = page.locator('main section :text("衡量标准")').first
        box = ind_label.bounding_box()
        assert box is not None
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        page.mouse.move(cx, cy)
        page.mouse.wheel(0, -120)
        page.mouse.down()
        page.mouse.move(cx + 22, cy + 16, steps=4)
        page.mouse.up()
        page.wait_for_timeout(150)

        pre_storage = get_zoomer_positions(page) or {}
        assert "Indicators/Compact" in pre_storage, f"Expected Indicators/Compact in zoomer storage: {pre_storage}"
        pre_styles = read_zoomer_styles(page)

        page.evaluate("() => window.scrollTo(0, 120)")
        page.wait_for_timeout(50)

        get_help_button(page).evaluate("el => el.click()")
        assert is_tour_open(page)
        assert page.evaluate("() => window.scrollY") == 0

        next_btn = page.locator('main a:has-text("下一个"), main a:has-text("Next")').first
        for idx in range(12):
            if idx >= 4:
                info = measure_tour_spotlight_and_anchor(page, idx)
                assert info["anchorRect"] is not None and info["markerRect"] is not None, f"Slide {idx} missing anchor/marker: {info}"
            if idx < 11:
                next_btn.click()

        page.locator('main a:has-text("关闭"), main a:has-text("Close")').first.click()
        page.wait_for_timeout(150)

        assert not is_tour_open(page)
        assert get_practice_view(page) == VIEW_COMPACT
        post_styles = read_zoomer_styles(page)
        assert post_styles["indicators"]["left"] == pre_styles["indicators"]["left"]
        assert get_zoomer_positions(page) == pre_storage

        # Resume Chinese typing cleanly
        focus_zh_input(page)
        tok = read_zh_lesson_tokens(page)
        type_key_stream(page, tok["words"][0]["bodyCode"])
        after = read_zh_lesson_tokens(page)
        assert after["words"][0]["spaceCursor"] or after["words"][1]["units"][0]["cursor"]


def t4_04_zh_qp_fuzzy_and_forgive_errors_practice_to_profile(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    """Scenario 4 (F1, F7): Quanpin fuzzy + forgiveErrors + Control+Backspace -> complete lesson -> /profile."""
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-qp", "keyboard.layout": "zh-qp", "lesson.targetSpeed": 175},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        select_zh_scheme(page, r"^(全拼|Full Pinyin)$")
        set_typing_options(page, stop_on_error=False, forgive_errors=True, space_skips_words=False)
        set_fuzzy_options(page, {"zh ↔ z": True, "an ↔ ang": True})
        save_settings(page)
        focus_zh_input(page)

        tok = read_zh_lesson_tokens(page)
        w0_body = tok["words"][0]["bodyCode"]
        type_key_stream(page, w0_body[:2])
        page.keyboard.press("Control+Backspace")
        reset_tok = read_zh_lesson_tokens(page)
        assert reset_tok["words"][0]["units"][0]["cursor"] and reset_tok["cursorActiveIndex"] == 0

        # Complete entire lesson with paced keystrokes (>= 40ms/key for Histogram.validate)
        time.sleep(0.06)
        type_key_stream(page, reset_tok["fullStream"], per_key_ms=52.0, min_total_ms=1400.0)
        wait_for_indexeddb_count(page, 1)

        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        select_profile_grouper(page, layout_pattern=r"全拼|Full Pinyin")
        ks = read_key_selector_tiles(page)
        assert len(ks) >= 26
        tiles = read_mastery_tiles(page)
        assert len(tiles) >= 26


def t4_05_multi_route_chrome_theme_and_github_nav_invariance(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    """Scenario 5 (F4, F5, F6): Browse / -> /profile -> /en/profile -> /keytrace toggling themes, checking 2-button toolbar & GitHub link."""
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp"},
        prefs_cookie={"color": "light", "font": "open-sans"},
    ) as (_, page, _, _):
        routes = [
            ("/", "zh-hans", "dark"),
            ("/profile", "zh-hans", "light"),
            ("/en/profile", "en", "dark"),
            ("/keytrace", "zh-hans", "light"),
        ]
        for path, expected_lang, next_color in routes:
            page.goto(f"{base_url}{path}", wait_until="domcontentloaded")
            assert get_html_attrs(page)["lang"] == expected_lang
            expect(get_toolbar_buttons(page)).to_have_count(2)
            expect(page.locator(f'nav a[href="{GITHUB_URL}"]')).to_be_visible()
            get_theme_button(page).click()
            expect(page.locator("html")).to_have_attribute("data-color", next_color)
            expect(page.locator('[role="menu"], [role="dialog"]')).to_have_count(0)


def t4_06_keytrace_sync_calibrated_profile_back_to_practice_drill(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    """Scenario 6 (F1, F2, F4): Seeded/KeyTrace multi-session /profile inspection -> <nav> Practice -> ZH/EN layout check."""
    today_str = time.strftime("%Y-%m-%d", time.localtime())
    now_ms = int(time.time() * 1000) - 60_000
    created_file = None
    if keytrace_dir is not None:
        events = build_realistic_keytrace_events(
            base_ts=now_ms,
            tokens=[
                ("enter ", 230.0, 0),
                ("tenet ", 240.0, 0),
                ("retire ", 260.0, 1),
                ("entire ", 250.0, 0),
                ("inert ", 245.0, 0),
            ],
        )
        created_file = write_keytrace_jsonl(Path(keytrace_dir), today_str, events)

    try:
        with open_context(
            browser,
            base_url,
            settings={"keyboard.language": "en", "keyboard.layout": "en-us", "lesson.targetSpeed": 175},
        ) as (_, page, _, _):
            page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
            seed_indexeddb_results(
                page,
                [
                    make_result_json(
                        "en-us",
                        ts=now_ms - 120_000,
                        length=45,
                        time_ms=13500,
                        errors=3,
                        histogram={
                            ord("e"): (15, 3, 410),
                            ord("n"): (15, 0, 210),
                            ord("t"): (15, 0, 220),
                        },
                    )
                ],
            )
            page.reload(wait_until="domcontentloaded")

            sync_btn = page.locator('main button:has-text("同步日常数据"), main button:has-text("Sync KeyTrace")').first
            sync_btn.click()
            page.wait_for_function(
                """() => {
                    const t = document.body.innerText || '';
                    return t.includes('已同步') || t.includes('已是最新') || t.includes('Synced') || t.includes('up to date');
                }""",
                timeout=10000,
            )

            ks = read_key_selector_tiles(page)
            legend = read_mastery_legend(page)
            tiles = read_mastery_tiles(page)
            assert ord("e") in ks and ord("n") in ks
            assert not rgb_close(tiles["E"]["bg"], legend["done"])

            expect(page.locator(f'nav a[href="{GITHUB_URL}"]')).to_be_visible()
            page.locator('nav a:has-text("练习"), nav a:has-text("Practice")').first.click()
            wait_for_practice_ready(page)

            b0 = measure_practice_boxes(page)
            ensure_practice_language(page, "zh")
            b1 = measure_practice_boxes(page)
            assert max_box_delta(b0, b1) <= 1.0
    finally:
        if created_file is not None and created_file.exists():
            created_file.unlink(missing_ok=True)


TIER4_TESTS: list[tuple[str, Callable[..., None]]] = [
    ("t4_01_daily_zh_shuangpin_user_session_settings_to_profile", t4_01_daily_zh_shuangpin_user_session_settings_to_profile),
    ("t4_02_bilingual_learner_font_and_layout_stability_across_views", t4_02_bilingual_learner_font_and_layout_stability_across_views),
    ("t4_03_customized_workspace_full_12_slide_tour_and_resume_typing", t4_03_customized_workspace_full_12_slide_tour_and_resume_typing),
    ("t4_04_zh_qp_fuzzy_and_forgive_errors_practice_to_profile", t4_04_zh_qp_fuzzy_and_forgive_errors_practice_to_profile),
    ("t4_05_multi_route_chrome_theme_and_github_nav_invariance", t4_05_multi_route_chrome_theme_and_github_nav_invariance),
    ("t4_06_keytrace_sync_calibrated_profile_back_to_practice_drill", t4_06_keytrace_sync_calibrated_profile_back_to_practice_drill),
]

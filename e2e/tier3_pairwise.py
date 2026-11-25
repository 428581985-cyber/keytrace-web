from __future__ import annotations

import time
from typing import Callable

from playwright.sync_api import Browser, expect

from harness import (
    GITHUB_URL,
    VIEW_BARE,
    VIEW_COMPACT,
    ensure_practice_language,
    focus_zh_input,
    get_help_button,
    get_practice_view,
    get_theme_button,
    get_toolbar_buttons,
    is_tour_open,
    max_box_delta,
    measure_practice_boxes,
    measure_tour_spotlight_and_anchor,
    open_context,
    open_settings,
    press_char,
    read_key_selector_tiles,
    read_mastery_legend,
    read_mastery_tiles,
    read_zh_lesson_tokens,
    read_zoomer_styles,
    rgb_close,
    save_settings,
    select_profile_grouper,
    select_settings_font,
    select_zh_scheme,
    set_typing_options,
    skip_lesson,
    type_key_stream,
    wait_for_indexeddb_count,
    wait_for_practice_ready,
)


def t3_01_f1_f7_zh_sp_live_lesson_stop_on_error_false_to_profile(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp", "lesson.targetSpeed": 175},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        set_typing_options(page, stop_on_error=False, forgive_errors=False, space_skips_words=False)
        save_settings(page)
        focus_zh_input(page)

        tokens = read_zh_lesson_tokens(page)
        stream = tokens["fullStream"]
        assert len(stream) >= 20
        # makeStats ignores steps[0] (Histogram.from(steps.slice(1))), so inject mistake on steps[1]!
        err_char = stream[1]
        assert err_char.isalpha(), f"Expected stream[1] to be a letter, got {stream[:6]!r}"
        wrong = "x" if err_char != "x" else "q"

        press_char(page, stream[0])
        press_char(page, wrong)
        page.keyboard.press("Backspace")
        time.sleep(0.06)
        type_key_stream(page, stream[1:], per_key_ms=52.0, min_total_ms=1350.0)

        wait_for_indexeddb_count(page, 1)
        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        legend = read_mastery_legend(page)
        tiles = read_mastery_tiles(page)
        err_key = err_char.upper()
        assert err_key in tiles, f"Expected {err_key} in MasterySection tiles"
        assert not rgb_close(tiles[err_key]["bg"], legend["done"]), (
            f"Erroneous low-sample key {err_key} must NOT be done green: {tiles[err_key]}"
        )


def t3_02_f1_f7_zh_qp_live_lesson_forgive_errors_to_profile(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
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
        save_settings(page)
        focus_zh_input(page)

        tokens = None
        for _ in range(12):
            tok = read_zh_lesson_tokens(page)
            if len(tok["words"][0]["bodyCode"]) >= 4 and tok["words"][0]["bodyCode"][1].isalpha():
                tokens = tok
                break
            skip_lesson(page)
            focus_zh_input(page)
        assert tokens is not None

        stream = tokens["fullStream"]
        # Inject error on stream[1] (steps[1], since steps[0] is ignored by makeStats!)
        # With stopOnError=False & forgiveErrors=True, type stream[0], then Backspace/recover or replaced char + stream[2:]
        err_char = stream[1]
        err_cp = ord(err_char)
        wrong = "x" if err_char != "x" else "q"
        press_char(page, stream[0])
        press_char(page, wrong)
        page.keyboard.press("Backspace")
        time.sleep(0.06)
        type_key_stream(page, stream[1:], per_key_ms=52.0, min_total_ms=1350.0)

        wait_for_indexeddb_count(page, 1)
        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        select_profile_grouper(page, layout_pattern=r"全拼|Full Pinyin")
        ks = read_key_selector_tiles(page)
        assert err_cp in ks, f"Expected err_cp={err_cp} in KeySelector keys={list(ks.keys())}"
        legend = read_mastery_legend(page)
        tiles = read_mastery_tiles(page)
        assert not rgb_close(tiles[err_char.upper()]["bg"], legend["done"])


def t3_03_f2_f3_compact_view_tour_restore_then_zh_en_toggle_shift_le_1px(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
        practice_view=VIEW_COMPACT,
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        assert get_practice_view(page) == VIEW_COMPACT

        get_help_button(page).click()
        assert is_tour_open(page)
        page.keyboard.press("Escape")
        page.wait_for_timeout(120)
        assert get_practice_view(page) == VIEW_COMPACT

        before = measure_practice_boxes(page)
        ensure_practice_language(page, "en")
        page.wait_for_timeout(120)
        after = measure_practice_boxes(page)
        delta = max_box_delta(before, after, ("main", "controls", "indicators", "textArea", "zhBtn", "enBtn"))
        assert delta <= 1.0, f"Compact post-tour ZH->EN shift {delta:.2f}px > 1.0px"


def t3_04_f2_f6_settings_font_plus_zh_en_toggle_stability(
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
        select_settings_font(page, r"^楷体$")
        save_settings(page)

        before = measure_practice_boxes(page)
        ensure_practice_language(page, "en")
        ensure_practice_language(page, "zh")
        page.wait_for_timeout(120)
        after = measure_practice_boxes(page)
        assert max_box_delta(before, after) <= 1.0
        ff = read_zh_lesson_tokens(page)["words"][0]["units"][0]["fontFamily"] or ""
        assert "KaiTi" in ff


def t3_05_f3_f5_dark_theme_tour_with_bare_view_and_zoomer_restore(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    seeded_zoom = {"TextArea/Bare": {"x": -14, "y": 16, "zoom": 0.9}}
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
        prefs_cookie={"color": "light", "font": "open-sans"},
        practice_view=VIEW_BARE,
        zoomer_positions=seeded_zoom,
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        get_theme_button(page).click()
        expect(page.locator("html")).to_have_attribute("data-color", "dark")
        pre_styles = read_zoomer_styles(page)
        assert pre_styles["textArea"]["left"] != 0

        get_help_button(page).click()
        assert is_tour_open(page)
        for _ in range(4):
            page.keyboard.press("ArrowRight")
        info = measure_tour_spotlight_and_anchor(page, 4)
        assert info["anchorRect"] is not None and info["markerRect"] is not None
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)

        assert get_practice_view(page) == VIEW_BARE
        expect(page.locator("html")).to_have_attribute("data-color", "dark")
        post_styles = read_zoomer_styles(page)
        assert post_styles["textArea"]["left"] == pre_styles["textArea"]["left"]


def t3_06_f4_f5_f6_nav_chrome_invariance_across_theme_toggles(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp"},
        prefs_cookie={"color": "light", "font": "open-sans"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        for expected in ("dark", "light", "dark"):
            get_theme_button(page).click()
            expect(page.locator("html")).to_have_attribute("data-color", expected)
            expect(get_toolbar_buttons(page)).to_have_count(2)
            expect(page.locator(f'nav a[href="{GITHUB_URL}"]')).to_be_visible()
            expect(page.locator('[role="menu"], [role="dialog"]')).to_have_count(0)


def t3_07_f6_f8_settings_ciyu_wording_and_font_selector_together(
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
        lbl = page.locator("main fieldset:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1)")
        assert (lbl.inner_text() or "").strip() == "重复每个词语："
        select_settings_font(page, r"^仿宋$")
        save_settings(page)

        ff = read_zh_lesson_tokens(page)["words"][0]["units"][0]["fontFamily"] or ""
        assert "FangSong" in ff
        open_settings(page)
        assert (lbl.inner_text() or "").strip() == "重复每个词语："


def t3_08_f7_f8_settings_ciyu_plus_all_three_typing_options_live_zh(
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
        lbl = page.locator("main fieldset:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1)")
        assert (lbl.inner_text() or "").strip() == "重复每个词语："
        set_typing_options(page, stop_on_error=False, forgive_errors=False, space_skips_words=True)
        save_settings(page)
        focus_zh_input(page)

        tok = read_zh_lesson_tokens(page)
        press_char(page, tok["words"][0]["bodyCode"][0])
        press_char(page, " ")
        after = read_zh_lesson_tokens(page)
        assert after["words"][1]["units"][0]["cursor"]


def t3_09_f1_f4_f5_profile_dark_mode_and_github_nav(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
        prefs_cookie={"color": "light", "font": "open-sans"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        get_theme_button(page).click()
        expect(page.locator("html")).to_have_attribute("data-color", "dark")
        expect(page.locator(f'nav a[href="{GITHUB_URL}"]')).to_be_visible()
        expect(get_toolbar_buttons(page)).to_have_count(2)
        legend = read_mastery_legend(page)
        assert "done" in legend and "weak" in legend


def t3_10_f2_f7_zh_en_toggle_during_partial_typing_preserves_layout(
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
        focus_zh_input(page)
        tok = read_zh_lesson_tokens(page)
        type_key_stream(page, tok["words"][0]["bodyCode"][:2])

        ensure_practice_language(page, "en")
        mid = measure_practice_boxes(page)
        ensure_practice_language(page, "zh")
        after = measure_practice_boxes(page)
        assert max_box_delta(before, mid) <= 1.0
        assert max_box_delta(before, after) <= 1.0


TIER3_TESTS: list[tuple[str, Callable[..., None]]] = [
    ("t3_01_f1_f7_zh_sp_live_lesson_stop_on_error_false_to_profile", t3_01_f1_f7_zh_sp_live_lesson_stop_on_error_false_to_profile),
    ("t3_02_f1_f7_zh_qp_live_lesson_forgive_errors_to_profile", t3_02_f1_f7_zh_qp_live_lesson_forgive_errors_to_profile),
    ("t3_03_f2_f3_compact_view_tour_restore_then_zh_en_toggle_shift_le_1px", t3_03_f2_f3_compact_view_tour_restore_then_zh_en_toggle_shift_le_1px),
    ("t3_04_f2_f6_settings_font_plus_zh_en_toggle_stability", t3_04_f2_f6_settings_font_plus_zh_en_toggle_stability),
    ("t3_05_f3_f5_dark_theme_tour_with_bare_view_and_zoomer_restore", t3_05_f3_f5_dark_theme_tour_with_bare_view_and_zoomer_restore),
    ("t3_06_f4_f5_f6_nav_chrome_invariance_across_theme_toggles", t3_06_f4_f5_f6_nav_chrome_invariance_across_theme_toggles),
    ("t3_07_f6_f8_settings_ciyu_wording_and_font_selector_together", t3_07_f6_f8_settings_ciyu_wording_and_font_selector_together),
    ("t3_08_f7_f8_settings_ciyu_plus_all_three_typing_options_live_zh", t3_08_f7_f8_settings_ciyu_plus_all_three_typing_options_live_zh),
    ("t3_09_f1_f4_f5_profile_dark_mode_and_github_nav", t3_09_f1_f4_f5_profile_dark_mode_and_github_nav),
    ("t3_10_f2_f7_zh_en_toggle_during_partial_typing_preserves_layout", t3_10_f2_f7_zh_en_toggle_during_partial_typing_preserves_layout),
]

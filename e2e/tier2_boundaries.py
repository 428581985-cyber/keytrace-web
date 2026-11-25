from __future__ import annotations

import re
import time
from typing import Callable

from playwright.sync_api import Browser, expect

from harness import (
    COLOR_HIT_RGB,
    GITHUB_URL,
    VIEW_BARE,
    VIEW_COMPACT,
    VIEW_NORMAL,
    dismiss_tour_if_open,
    ensure_practice_language,
    focus_zh_input,
    get_help_button,
    get_html_attrs,
    get_practice_view,
    get_prefs_cookie,
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
    reset_settings,
    rgb_close,
    save_settings,
    seed_indexeddb_results,
    select_profile_grouper,
    select_settings_font,
    select_zh_scheme,
    set_fuzzy_options,
    set_lesson_length_slider,
    set_punctuation_slider,
    set_typing_options,
    skip_lesson,
    type_key_stream,
    wait_for_practice_ready,
)


# ===========================================================================
# F1 Boundary & Corner Cases — 5 tests
# ===========================================================================


def t2_f1_01_profile_empty_history_renders_no_data_tiles(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        legend = read_mastery_legend(page)
        tiles = read_mastery_tiles(page)
        assert len(tiles) == 26
        for letter, info in tiles.items():
            assert rgb_close(info["bg"], legend["none"]), f"Empty history tile {letter} should be none: {info}"


def t2_f1_02_profile_mid_speed_28wpm_mastery_and_key_selector_not_green(
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
            ts=now - 4000,
            length=60,
            time_ms=22000,
            errors=0,
            histogram={
                ord("e"): (20, 0, 430),  # ~27.9 WPM (below 35 WPM target)
                ord("a"): (20, 0, 180),  # ~66.7 WPM (fast)
                ord("n"): (20, 0, 600),  # ~20.0 WPM (slow)
            },
        )
        seed_indexeddb_results(page, [rec])
        page.reload(wait_until="domcontentloaded")

        legend = read_mastery_legend(page)
        tiles = read_mastery_tiles(page)
        ks = read_key_selector_tiles(page)
        assert rgb_close(tiles["A"]["bg"], legend["done"]), f"Fast A should be done green: {tiles['A']}"
        assert not rgb_close(tiles["E"]["bg"], legend["done"]), f"28 WPM E must NOT be done green: {tiles['E']}"
        assert not rgb_close(tiles["N"]["bg"], legend["done"]), f"20 WPM N must NOT be done green: {tiles['N']}"
        assert not rgb_close(ks[ord("e")]["bg"], ks[ord("a")]["bg"], tolerance=12), (
            f"KeySelector 28 WPM E ({ks[ord('e')]}) should not match fast green A ({ks[ord('a')]})"
        )


def t2_f1_03_profile_sub_1000ms_invalid_result_ignored(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    now = int(time.time() * 1000)
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        valid_rec = make_result_json("en-us", ts=now - 10_000, length=40, time_ms=10_000)
        invalid_rec = make_result_json("en-us", ts=now - 5_000, length=40, time_ms=500)
        seed_indexeddb_results(page, [valid_rec, invalid_rec])
        page.reload(wait_until="domcontentloaded")
        stats = read_summary_stats(page, r"总统计数据|All Time Statistics")
        assert stats.get("字符") == "40" or stats.get("Characters") == "40", f"Sub-1000ms result should be ignored: {stats}"


def t2_f1_04_profile_zh_sp_ms_semicolon_key_rendered_and_calibrated(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    now = int(time.time() * 1000)
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp-ms", "lesson.targetSpeed": 175},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        rec = make_result_json(
            "zh-sp-ms",
            ts=now - 5000,
            length=60,
            time_ms=13200,
            errors=0,
            histogram={
                ord(";"): (25, 0, 220),
                ord("q"): (20, 0, 220),
                ord("w"): (20, 0, 220),
            },
        )
        seed_indexeddb_results(page, [rec])
        page.reload(wait_until="domcontentloaded")
        legend = read_mastery_legend(page)
        tiles = read_mastery_tiles(page)
        assert ";" in tiles, f"Expected ';' tile in zh-sp-ms MasterySection, got keys={list(tiles.keys())}"
        assert rgb_close(tiles[";"]["bg"], legend["done"]), f"Fast ';' tile should be done green: {tiles[';']}"


def t2_f1_05_profile_character_class_digits_switch_and_restore(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    now = int(time.time() * 1000)
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        seed_indexeddb_results(page, [make_result_json("en-us", ts=now - 5000)])
        page.reload(wait_until="domcontentloaded")
        select_profile_grouper(page, char_class_pattern=r"^(数字|Digits)$")
        select_profile_grouper(page, char_class_pattern=r"^(字母|Letters)$")
        ks = read_key_selector_tiles(page)
        assert ord("e") in ks


# ===========================================================================
# F2 Boundary & Corner Cases — 5 tests
# ===========================================================================


def t2_f2_01_compact_view_zh_en_toggle_layout_shift_le_1px(
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
        expect(page.locator('main section svg[height="23rem"]')).to_have_count(0)
        before = measure_practice_boxes(page)
        ensure_practice_language(page, "en")
        page.wait_for_timeout(120)
        after = measure_practice_boxes(page)
        delta = max_box_delta(before, after, ("main", "controls", "indicators", "textArea", "zhBtn", "enBtn"))
        assert delta <= 1.0, f"Compact view ZH->EN shift {delta:.2f}px > 1.0px"


def t2_f2_02_bare_view_zh_en_toggle_layout_shift_le_1px(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
        practice_view=VIEW_BARE,
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        assert get_practice_view(page) == VIEW_BARE
        expect(page.locator('main section :text("衡量标准")')).to_have_count(0)
        before = measure_practice_boxes(page)
        ensure_practice_language(page, "en")
        page.wait_for_timeout(120)
        after = measure_practice_boxes(page)
        delta = max_box_delta(before, after, ("main", "controls", "textArea", "zhBtn", "enBtn"))
        assert delta <= 1.0, f"Bare view ZH->EN shift {delta:.2f}px > 1.0px"


def t2_f2_03_narrow_960x720_viewport_zh_en_toggle_shift_le_1px(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        viewport={"width": 960, "height": 720},
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        before = measure_practice_boxes(page)
        ensure_practice_language(page, "en")
        page.wait_for_timeout(120)
        after = measure_practice_boxes(page)
        delta = max_box_delta(before, after)
        assert delta <= 1.0, f"960x720 ZH->EN shift {delta:.2f}px > 1.0px"


def t2_f2_04_quanpin_tall_inflow_zh_en_toggle_shift_le_1px(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-qp", "keyboard.layout": "zh-qp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        before = measure_practice_boxes(page)
        ensure_practice_language(page, "en")
        page.wait_for_timeout(150)
        after = measure_practice_boxes(page)
        delta = max_box_delta(before, after)
        assert delta <= 1.0, f"Quanpin->EN shift {delta:.2f}px > 1.0px"


def t2_f2_05_rapid_double_click_lang_toggle_leaves_stable_state(
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
        zh_btn = page.locator('main [role="group"] button').nth(0)
        en_btn = page.locator('main [role="group"] button').nth(1)
        en_btn.click()
        page.wait_for_timeout(30)
        zh_btn.click()
        expect(zh_btn).to_have_attribute("aria-pressed", "true", timeout=10000)
        page.locator("main [data-scheme]").wait_for(state="visible", timeout=10000)
        page.wait_for_timeout(150)
        after = measure_practice_boxes(page)
        assert max_box_delta(before, after) <= 1.0


# ===========================================================================
# F3 Boundary & Corner Cases — 5 tests
# ===========================================================================


def t2_f3_01_tour_disabled_view_switch_and_reopen_idempotent(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
        practice_view=VIEW_COMPACT,
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        assert get_practice_view(page) == VIEW_COMPACT

        get_help_button(page).click()
        assert is_tour_open(page)
        # Clicking view-switch while tour is open must be ignored (backdrop blocks or handleChangeView guards)
        get_view_switch_button(page).click(force=True)
        page.keyboard.press("Escape")
        page.wait_for_timeout(120)
        assert get_practice_view(page) == VIEW_COMPACT

        # Second open/close cycle remains idempotent
        get_help_button(page).click()
        assert is_tour_open(page)
        page.keyboard.press("Escape")
        page.wait_for_timeout(120)
        assert get_practice_view(page) == VIEW_COMPACT


def t2_f3_02_first_visit_empty_settings_auto_opens_tour_and_stays_normal(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(browser, base_url) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        assert is_tour_open(page), "Expected first visit with empty settings to auto-open tour"
        dismiss_tour_if_open(page)
        assert get_practice_view(page) == VIEW_NORMAL


def t2_f3_03_tour_keyboard_navigation_arrow_keys_and_escape(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        get_help_button(page).click()
        assert is_tour_open(page)
        for _ in range(4):
            page.keyboard.press("ArrowRight")
        info = measure_tour_spotlight_and_anchor(page, 4)
        assert info["anchorRect"] is not None and info["markerRect"] is not None
        page.keyboard.press("ArrowLeft")
        page.keyboard.press("Escape")
        page.wait_for_timeout(120)
        assert not is_tour_open(page)


def t2_f3_04_tour_preserves_zoomer_storage_on_compact_view_across_reload(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    seeded_zoom = {
        "Indicators/Compact": {"x": 15, "y": 10, "zoom": 1.1},
        "TextArea/Compact": {"x": -10, "y": 15, "zoom": 0.95},
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
        assert get_practice_view(page) == VIEW_COMPACT
        pre_styles = read_zoomer_styles(page)
        assert pre_styles["indicators"]["left"] != 0

        get_help_button(page).click()
        assert is_tour_open(page)
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        assert get_practice_view(page) == VIEW_COMPACT
        post_styles = read_zoomer_styles(page)
        assert post_styles["indicators"]["left"] == pre_styles["indicators"]["left"]

        page.reload(wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        reloaded_storage = get_zoomer_positions(page) or {}
        assert "Indicators/Compact" in reloaded_storage
        assert reloaded_storage["Indicators/Compact"]["zoom"] != 1


def t2_f3_05_view_cycle_normal_compact_bare_normal_after_tour(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "en", "keyboard.layout": "en-us"},
        practice_view=VIEW_BARE,
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        assert get_practice_view(page) == VIEW_BARE

        get_help_button(page).click()
        page.keyboard.press("Escape")
        page.wait_for_timeout(120)
        assert get_practice_view(page) == VIEW_BARE

        sw = get_view_switch_button(page)
        sw.click()
        assert get_practice_view(page) == VIEW_NORMAL
        sw.click()
        assert get_practice_view(page) == VIEW_COMPACT
        sw.click()
        assert get_practice_view(page) == VIEW_BARE


# ===========================================================================
# F4 Boundary & Corner Cases — 5 tests
# ===========================================================================


def t2_f4_01_nav_github_link_unique_count_one(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(browser, base_url, settings={"keyboard.language": "zh-sp"}) as (_, page, _, _):
        for path in ("/", "/profile"):
            page.goto(f"{base_url}{path}", wait_until="domcontentloaded")
            expect(page.locator(f'nav a[href="{GITHUB_URL}"]')).to_have_count(1)


def t2_f4_02_nav_github_link_visible_in_settings_view(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(browser, base_url, settings={"keyboard.language": "zh-sp"}) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        open_settings(page)
        expect(page.locator(f'nav a[href="{GITHUB_URL}"]')).to_be_visible()


def t2_f4_03_nav_github_link_visible_in_bare_view(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp"},
        practice_view=VIEW_BARE,
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        wait_for_practice_ready(page)
        assert get_practice_view(page) == VIEW_BARE
        expect(page.locator(f'nav a[href="{GITHUB_URL}"]')).to_be_visible()


def t2_f4_04_nav_github_link_keyboard_focusable(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(browser, base_url, settings={"keyboard.language": "zh-sp"}) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        link = page.locator(f'nav a[href="{GITHUB_URL}"]')
        expect(link).to_be_visible(timeout=10000)
        link.focus()
        active_href = page.evaluate("() => document.activeElement && document.activeElement.getAttribute('href')")
        assert active_href == GITHUB_URL


def t2_f4_05_nav_github_link_visible_on_en_keytrace_and_help(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(browser, base_url, settings={"keyboard.language": "en"}) as (_, page, _, _):
        for path in ("/en/keytrace", "/help"):
            page.goto(f"{base_url}{path}", wait_until="domcontentloaded")
            expect(page.locator(f'nav a[href="{GITHUB_URL}"]')).to_be_visible(timeout=10000)


# ===========================================================================
# F5 Boundary & Corner Cases — 5 tests
# ===========================================================================


def t2_f5_01_rapid_theme_toggle_roundtrip_light_dark_light(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp"},
        prefs_cookie={"color": "light", "font": "open-sans"},
    ) as (ctx, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        btn = get_theme_button(page)
        for _ in range(4):
            btn.click()
        expect(page.locator("html")).to_have_attribute("data-color", "light")
        assert (get_prefs_cookie(ctx) or {}).get("color") == "light"
        expect(page.locator('[role="menu"], [role="menuitem"], [role="dialog"]')).to_have_count(0)


def t2_f5_02_custom_or_legacy_cookie_color_recovers_via_direct_toggle(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        color_scheme="light",
        settings={"keyboard.language": "zh-sp"},
        prefs_cookie={"color": "custom", "font": "open-sans"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        btn = get_theme_button(page)
        btn.click()
        expect(page.locator("html")).to_have_attribute("data-color", "dark")
        btn.click()
        expect(page.locator("html")).to_have_attribute("data-color", "light")


def t2_f5_03_theme_toggle_via_keyboard_enter(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp"},
        prefs_cookie={"color": "light", "font": "open-sans"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        btn = get_theme_button(page)
        btn.focus()
        page.keyboard.press("Enter")
        expect(page.locator("html")).to_have_attribute("data-color", "dark")


def t2_f5_04_theme_toggle_on_profile_and_keytrace_pages(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp"},
        prefs_cookie={"color": "light", "font": "open-sans"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/profile", wait_until="domcontentloaded")
        get_theme_button(page).click()
        expect(page.locator("html")).to_have_attribute("data-color", "dark")
        expect(page.locator('[role="menu"]')).to_have_count(0)

        page.goto(f"{base_url}/keytrace", wait_until="domcontentloaded")
        get_theme_button(page).click()
        expect(page.locator("html")).to_have_attribute("data-color", "light")
        expect(page.locator('[role="menu"]')).to_have_count(0)


def t2_f5_05_theme_toggle_preserves_selected_font_attribute(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    # "roboto" is a valid FONTS id in packages/keybr-themes/lib/themes/themes.ts
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp"},
        prefs_cookie={"color": "dark", "font": "roboto"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        expect(page.locator("html")).to_have_attribute("data-font", "roboto")
        get_theme_button(page).click()
        expect(page.locator("html")).to_have_attribute("data-color", "light")
        expect(page.locator("html")).to_have_attribute("data-font", "roboto")


# ===========================================================================
# F6 Boundary & Corner Cases — 5 tests
# ===========================================================================


def t2_f6_01_nav_has_zero_font_menu_triggers_or_popovers(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(browser, base_url, settings={"keyboard.language": "zh-sp"}) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        btns = get_toolbar_buttons(page)
        expect(btns).to_have_count(2)
        btns.nth(0).click()
        expect(page.locator('[role="menu"], [role="menuitem"], [role="dialog"]')).to_have_count(0)


def t2_f6_02_settings_font_works_even_when_zh_show_code_disabled(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
        show_code={"keytrace.zh.showCode": "0"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        expect(page.locator('main [data-scheme] [data-code="1"]')).to_have_count(0)
        open_settings(page)
        select_settings_font(page, r"^宋体$")
        save_settings(page)
        tokens = read_zh_lesson_tokens(page)
        ff = tokens["words"][0]["units"][0]["fontFamily"] or ""
        assert "SimSun" in ff, f"Expected SimSun fontFamily even with showCode=0, got {ff!r}"


def t2_f6_03_settings_reset_restores_default_font(
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
        assert "KaiTi" in (read_zh_lesson_tokens(page)["words"][0]["units"][0]["fontFamily"] or "")

        open_settings(page)
        reset_settings(page)
        save_settings(page)
        ensure_practice_language(page, "zh")
        ff = read_zh_lesson_tokens(page)["words"][0]["units"][0]["fontFamily"] or ""
        assert "KaiTi" not in ff, f"Reset should restore default ZH font, still got {ff!r}"


def t2_f6_04_settings_font_isolated_between_zh_and_en_languages(
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

        ensure_practice_language(page, "en")
        en_ff = page.locator('main div[dir="ltr"]').first.evaluate("el => window.getComputedStyle(el).fontFamily")
        assert "KaiTi" not in en_ff

        ensure_practice_language(page, "zh")
        zh_ff = read_zh_lesson_tokens(page)["words"][0]["units"][0]["fontFamily"] or ""
        assert "KaiTi" in zh_ff


def t2_f6_05_settings_font_preserved_when_toggling_dark_light_theme(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
        prefs_cookie={"color": "light", "font": "open-sans"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        select_settings_font(page, r"^楷体$")
        save_settings(page)
        get_theme_button(page).click()
        expect(page.locator("html")).to_have_attribute("data-color", "dark")
        zh_ff = read_zh_lesson_tokens(page)["words"][0]["units"][0]["fontFamily"] or ""
        assert "KaiTi" in zh_ff


# ===========================================================================
# F7 Boundary & Corner Cases — 5 tests
# ===========================================================================


def t2_f7_01_zh_sp_ms_semicolon_key_with_stop_on_error_false(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp-ms"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        select_zh_scheme(page, r"^(微软双拼|Microsoft Shuangpin)$")
        set_typing_options(page, stop_on_error=False, forgive_errors=False)
        save_settings(page)
        focus_zh_input(page)

        found = None
        for _ in range(25):
            tok = read_zh_lesson_tokens(page)
            if ";" in tok["words"][0]["bodyCode"]:
                found = tok
                break
            skip_lesson(page)
            focus_zh_input(page)
        assert found is not None, "Failed to find a zh-sp-ms word containing ';' in 25 skips"

        w0 = found["words"][0]
        w0_body = w0["bodyCode"]
        expected_hanzi = w0["fullHanzi"]
        wrong = "x" if w0_body[0] != "x" else "q"
        press_char(page, wrong)
        mid = read_zh_lesson_tokens(page)
        assert mid["words"][0]["fullHanzi"] == expected_hanzi
        page.keyboard.press("Backspace")
        type_key_stream(page, w0_body)
        after = read_zh_lesson_tokens(page)
        assert after["words"][0]["fullHanzi"] == expected_hanzi
        assert after["words"][0]["spaceCursor"] or after["words"][1]["units"][0]["cursor"]


def t2_f7_02_zh_sp_space_skips_words_respects_zh_comma_period_boundary(
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
        set_punctuation_slider(page, 100)
        save_settings(page)
        focus_zh_input(page)

        found = None
        for _ in range(15):
            tok = read_zh_lesson_tokens(page)
            w0_codes = [u["code"] for u in tok["words"][0]["units"]]
            if any(c in (",", ".") for c in w0_codes):
                found = tok
                break
            skip_lesson(page)
            focus_zh_input(page)
        assert found is not None, "Expected punctuated word in zh-sp with punctuation slider=1.0"

        w0_first_code = found["words"][0]["units"][0]["code"][0]
        press_char(page, w0_first_code)
        press_char(page, " ")
        after = read_zh_lesson_tokens(page)
        assert after["words"][1]["units"][0]["cursor"], (
            f"spaceSkipsWords must jump past Chinese punctuation boundary to word 1: {after['words'][:2]}"
        )


def t2_f7_03_zh_sp_control_backspace_clears_active_word_cleanly(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        focus_zh_input(page)
        before = read_zh_lesson_tokens(page)
        w0 = before["words"][0]
        type_key_stream(page, w0["bodyCode"][:2])
        page.keyboard.press("Control+Backspace")
        after = read_zh_lesson_tokens(page)
        assert after["words"][0]["units"][0]["cursor"] and after["cursorActiveIndex"] == 0
        assert after["words"][0]["fullHanzi"] == w0["fullHanzi"]


def t2_f7_04_zh_sp_stop_on_error_false_forgive_errors_true_multiple_typos_bounded(
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
        set_typing_options(page, stop_on_error=False, forgive_errors=True, space_skips_words=False)
        save_settings(page)
        focus_zh_input(page)

        found = None
        for _ in range(10):
            tok = read_zh_lesson_tokens(page)
            if len(tok["words"][0]["bodyCode"]) >= 4 and len(tok["words"]) >= 2:
                found = tok
                break
            skip_lesson(page)
            focus_zh_input(page)
        assert found is not None

        w0 = found["words"][0]
        w1 = found["words"][1]
        expected_w0 = w0["fullHanzi"]
        expected_w1 = w1["fullHanzi"]
        wrong = "x" if w0["bodyCode"][0] != "x" else "q"
        # Replace w0[0] with wrong char and continue typing rest of w0 + space + w1[0:2]
        stream = wrong + w0["bodyCode"][1:] + (" " if w0["hasSpace"] else "") + w1["bodyCode"][:2]
        type_key_stream(page, stream)
        after = read_zh_lesson_tokens(page)
        assert after["words"][0]["fullHanzi"] == expected_w0
        assert after["words"][1]["fullHanzi"] == expected_w1
        total_garbage = sum(u["garbage"] for w in after["words"][:2] for u in w["units"])
        assert total_garbage <= 10


def t2_f7_05_zh_qp_forgive_errors_nasal_fuzzy_and_ng_g_boundary(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    # Seed unlocked zh-qp keys so words containing (-n/-ng) + g- (e.g., quanguo, yinggai, jingguo, chenggong) draw quickly.
    now = int(time.time() * 1000)
    seed_hist = {
        cp: (20, 0, 210)
        for cp in map(ord, "aeiouncgsjklmfbdptwxyzqh")
    }
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-qp", "keyboard.layout": "zh-qp", "lesson.targetSpeed": 175},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        seed_indexeddb_results(
            page,
            [make_result_json("zh-qp", ts=now - 5000, length=80, time_ms=16000, histogram=seed_hist)],
        )
        page.reload(wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")

        open_settings(page)
        select_zh_scheme(page, r"^(全拼|Full Pinyin)$")
        set_typing_options(page, stop_on_error=False, forgive_errors=True, space_skips_words=False)
        set_fuzzy_options(
            page,
            {
                "an ↔ ang": True,
                "en ↔ eng": True,
                "in ↔ ing": True,
                "ian ↔ iang": True,
                "uan ↔ uang": True,
            },
        )
        set_lesson_length_slider(page, 100)
        save_settings(page)
        focus_zh_input(page)

        nasal_re = re.compile(r"(?:an|en|in|ian|uan)(g?)$")
        target_tok = None
        target_word_idx = -1
        target_boundary_unit_idx = -1
        for _ in range(30):
            tok = read_zh_lesson_tokens(page)
            for w_idx, w in enumerate(tok["words"]):
                units = w["units"]
                for u_idx in range(len(units) - 1):
                    c1 = units[u_idx]["code"]
                    c2 = units[u_idx + 1]["code"]
                    m = nasal_re.search(c1)
                    if m and c2.startswith("g"):
                        target_tok = tok
                        target_word_idx = w_idx
                        target_boundary_unit_idx = u_idx
                        break
                if target_tok is not None:
                    break
            if target_tok is not None:
                break
            skip_lesson(page)
            focus_zh_input(page)

        assert target_tok is not None, "Failed to draw a Quanpin word with (-n/-ng) + g- boundary in 30 skips"

        # Type cleanly through preceding words
        for w in target_tok["words"][:target_word_idx]:
            type_key_stream(page, w["bodyCode"] + (" " if w["hasSpace"] else ""))

        target_word = target_tok["words"][target_word_idx]
        expected_hanzi = target_word["fullHanzi"]
        units = target_word["units"]
        # Build fuzzy boundary stream for target_word:
        # - If units[u_idx] ends in -n (canAddTrailingG) + g-, type extra 'g' after it (e.g. quan+guo -> quangguo)
        # - If units[u_idx] ends in -ng (hasTrailingG) + g-, omit its trailing 'g' (e.g. ying+gai -> yingai)
        stream_parts: list[str] = []
        for idx, u in enumerate(units):
            c = u["code"]
            if idx == target_boundary_unit_idx:
                if c.endswith("ng"):
                    stream_parts.append(c[:-1])  # omit trailing 'g' before g-
                else:
                    stream_parts.append(c + "g")  # add extra 'g' before g-
            else:
                stream_parts.append(c)
        fuzzy_word_stream = "".join(stream_parts) + (" " if target_word["hasSpace"] else "")
        type_key_stream(page, fuzzy_word_stream)

        after = read_zh_lesson_tokens(page)
        assert after["words"][target_word_idx]["fullHanzi"] == expected_hanzi, (
            f"(-n/-ng)+g- fuzzy boundary corrupted Hanzi: expected={expected_hanzi!r}, got={after['words'][target_word_idx]['fullHanzi']!r}"
        )
        # Verify cursor cleanly advanced past the target word (either next word or end)
        assert not any(u["cursor"] for u in after["words"][target_word_idx]["units"]), (
            f"Expected cursor to advance cleanly past (-n/-ng)+g- fuzzy word {target_word['bodyCode']!r} using {fuzzy_word_stream!r}: {after['words'][target_word_idx]}"
        )


# ===========================================================================
# F8 Boundary & Corner Cases — 5 tests
# ===========================================================================


def t2_f8_01_all_zh_schemes_keep_ciyu_label_at_exact_fieldset_path(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    schemes = [
        r"^(小鹤双拼|Xiaohe Shuangpin)$",
        r"^(自然码双拼|Ziranma Shuangpin)$",
        r"^(微软双拼|Microsoft Shuangpin)$",
        r"^(搜狗双拼|Sogou Shuangpin)$",
        r"^(全拼|Full Pinyin)$",
    ]
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        open_settings(page)
        for pat in schemes:
            select_zh_scheme(page, pat)
            lbl = page.locator("main fieldset:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1)")
            txt = (lbl.inner_text() or "").strip()
            assert txt == "重复每个词语：", f"Scheme {pat} expected '重复每个词语：', got {txt!r}"


def t2_f8_02_zh_ui_en_practice_mode_still_uses_ciyu_wording(
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
        lbl = page.locator("main fieldset:nth-of-type(1) > div:nth-of-type(5) > span:nth-of-type(1)")
        txt = (lbl.inner_text() or "").strip()
        assert txt == "重复每个词语：", f"Expected '重复每个词语：' in EN-practice ZH-UI, got {txt!r}"


def t2_f8_03_reset_settings_preserves_ciyu_wording(
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
        reset_settings(page)
        lbl = page.locator("main fieldset:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1)")
        assert (lbl.inner_text() or "").strip() == "重复每个词语："


def t2_f8_04_ciyu_wording_consistent_in_both_dark_and_light_themes(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
        prefs_cookie={"color": "light", "font": "open-sans"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/", wait_until="domcontentloaded")
        ensure_practice_language(page, "zh")
        for expected_color in ("dark", "light"):
            get_theme_button(page).click()
            expect(page.locator("html")).to_have_attribute("data-color", expected_color)
            open_settings(page)
            lbl = page.locator("main fieldset:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1)")
            assert (lbl.inner_text() or "").strip() == "重复每个词语："
            save_settings(page)


def t2_f8_05_en_to_zh_nav_language_toggle_shows_ciyu_in_settings(
    browser: Browser, base_url: str, keytrace_dir: str | None = None
) -> None:
    with open_context(
        browser,
        base_url,
        settings={"keyboard.language": "zh-sp", "keyboard.layout": "zh-sp"},
    ) as (_, page, _, _):
        page.goto(f"{base_url}/en", wait_until="domcontentloaded")
        assert get_html_attrs(page)["lang"] == "en"
        page.locator('nav a:has-text("简体中文")').first.click()
        page.wait_for_function("() => document.documentElement.getAttribute('lang') === 'zh-hans'", timeout=10000)
        ensure_practice_language(page, "zh")
        open_settings(page)
        lbl = page.locator("main fieldset:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1)")
        assert (lbl.inner_text() or "").strip() == "重复每个词语："


TIER2_TESTS: list[tuple[str, Callable[..., None]]] = [
    ("t2_f1_01_profile_empty_history_renders_no_data_tiles", t2_f1_01_profile_empty_history_renders_no_data_tiles),
    ("t2_f1_02_profile_mid_speed_28wpm_mastery_and_key_selector_not_green", t2_f1_02_profile_mid_speed_28wpm_mastery_and_key_selector_not_green),
    ("t2_f1_03_profile_sub_1000ms_invalid_result_ignored", t2_f1_03_profile_sub_1000ms_invalid_result_ignored),
    ("t2_f1_04_profile_zh_sp_ms_semicolon_key_rendered_and_calibrated", t2_f1_04_profile_zh_sp_ms_semicolon_key_rendered_and_calibrated),
    ("t2_f1_05_profile_character_class_digits_switch_and_restore", t2_f1_05_profile_character_class_digits_switch_and_restore),
    ("t2_f2_01_compact_view_zh_en_toggle_layout_shift_le_1px", t2_f2_01_compact_view_zh_en_toggle_layout_shift_le_1px),
    ("t2_f2_02_bare_view_zh_en_toggle_layout_shift_le_1px", t2_f2_02_bare_view_zh_en_toggle_layout_shift_le_1px),
    ("t2_f2_03_narrow_960x720_viewport_zh_en_toggle_shift_le_1px", t2_f2_03_narrow_960x720_viewport_zh_en_toggle_shift_le_1px),
    ("t2_f2_04_quanpin_tall_inflow_zh_en_toggle_shift_le_1px", t2_f2_04_quanpin_tall_inflow_zh_en_toggle_shift_le_1px),
    ("t2_f2_05_rapid_double_click_lang_toggle_leaves_stable_state", t2_f2_05_rapid_double_click_lang_toggle_leaves_stable_state),
    ("t2_f3_01_tour_disabled_view_switch_and_reopen_idempotent", t2_f3_01_tour_disabled_view_switch_and_reopen_idempotent),
    ("t2_f3_02_first_visit_empty_settings_auto_opens_tour_and_stays_normal", t2_f3_02_first_visit_empty_settings_auto_opens_tour_and_stays_normal),
    ("t2_f3_03_tour_keyboard_navigation_arrow_keys_and_escape", t2_f3_03_tour_keyboard_navigation_arrow_keys_and_escape),
    ("t2_f3_04_tour_preserves_zoomer_storage_on_compact_view_across_reload", t2_f3_04_tour_preserves_zoomer_storage_on_compact_view_across_reload),
    ("t2_f3_05_view_cycle_normal_compact_bare_normal_after_tour", t2_f3_05_view_cycle_normal_compact_bare_normal_after_tour),
    ("t2_f4_01_nav_github_link_unique_count_one", t2_f4_01_nav_github_link_unique_count_one),
    ("t2_f4_02_nav_github_link_visible_in_settings_view", t2_f4_02_nav_github_link_visible_in_settings_view),
    ("t2_f4_03_nav_github_link_visible_in_bare_view", t2_f4_03_nav_github_link_visible_in_bare_view),
    ("t2_f4_04_nav_github_link_keyboard_focusable", t2_f4_04_nav_github_link_keyboard_focusable),
    ("t2_f4_05_nav_github_link_visible_on_en_keytrace_and_help", t2_f4_05_nav_github_link_visible_on_en_keytrace_and_help),
    ("t2_f5_01_rapid_theme_toggle_roundtrip_light_dark_light", t2_f5_01_rapid_theme_toggle_roundtrip_light_dark_light),
    ("t2_f5_02_custom_or_legacy_cookie_color_recovers_via_direct_toggle", t2_f5_02_custom_or_legacy_cookie_color_recovers_via_direct_toggle),
    ("t2_f5_03_theme_toggle_via_keyboard_enter", t2_f5_03_theme_toggle_via_keyboard_enter),
    ("t2_f5_04_theme_toggle_on_profile_and_keytrace_pages", t2_f5_04_theme_toggle_on_profile_and_keytrace_pages),
    ("t2_f5_05_theme_toggle_preserves_selected_font_attribute", t2_f5_05_theme_toggle_preserves_selected_font_attribute),
    ("t2_f6_01_nav_has_zero_font_menu_triggers_or_popovers", t2_f6_01_nav_has_zero_font_menu_triggers_or_popovers),
    ("t2_f6_02_settings_font_works_even_when_zh_show_code_disabled", t2_f6_02_settings_font_works_even_when_zh_show_code_disabled),
    ("t2_f6_03_settings_reset_restores_default_font", t2_f6_03_settings_reset_restores_default_font),
    ("t2_f6_04_settings_font_isolated_between_zh_and_en_languages", t2_f6_04_settings_font_isolated_between_zh_and_en_languages),
    ("t2_f6_05_settings_font_preserved_when_toggling_dark_light_theme", t2_f6_05_settings_font_preserved_when_toggling_dark_light_theme),
    ("t2_f7_01_zh_sp_ms_semicolon_key_with_stop_on_error_false", t2_f7_01_zh_sp_ms_semicolon_key_with_stop_on_error_false),
    ("t2_f7_02_zh_sp_space_skips_words_respects_zh_comma_period_boundary", t2_f7_02_zh_sp_space_skips_words_respects_zh_comma_period_boundary),
    ("t2_f7_03_zh_sp_control_backspace_clears_active_word_cleanly", t2_f7_03_zh_sp_control_backspace_clears_active_word_cleanly),
    ("t2_f7_04_zh_sp_stop_on_error_false_forgive_errors_true_multiple_typos_bounded", t2_f7_04_zh_sp_stop_on_error_false_forgive_errors_true_multiple_typos_bounded),
    ("t2_f7_05_zh_qp_forgive_errors_nasal_fuzzy_and_ng_g_boundary", t2_f7_05_zh_qp_forgive_errors_nasal_fuzzy_and_ng_g_boundary),
    ("t2_f8_01_all_zh_schemes_keep_ciyu_label_at_exact_fieldset_path", t2_f8_01_all_zh_schemes_keep_ciyu_label_at_exact_fieldset_path),
    ("t2_f8_02_zh_ui_en_practice_mode_still_uses_ciyu_wording", t2_f8_02_zh_ui_en_practice_mode_still_uses_ciyu_wording),
    ("t2_f8_03_reset_settings_preserves_ciyu_wording", t2_f8_03_reset_settings_preserves_ciyu_wording),
    ("t2_f8_04_ciyu_wording_consistent_in_both_dark_and_light_themes", t2_f8_04_ciyu_wording_consistent_in_both_dark_and_light_themes),
    ("t2_f8_05_en_to_zh_nav_language_toggle_shows_ciyu_in_settings", t2_f8_05_en_to_zh_nav_language_toggle_shows_ciyu_in_settings),
]

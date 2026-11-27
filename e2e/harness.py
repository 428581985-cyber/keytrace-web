from __future__ import annotations

import contextlib
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterator

from playwright.sync_api import Browser, BrowserContext, Locator, Page, expect

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVER_ENTRY = REPO_ROOT / "root" / "index.js"

GITHUB_URL = "https://github.com/428581985-cyber/keytrace-web"

COLOR_TODO_RGB = "rgb(138, 133, 124)"
COLOR_HIT_RGB = "rgb(127, 174, 143)"
COLOR_MISS_RGB = "rgb(212, 80, 58)"

VIEW_NORMAL = "normal"
VIEW_COMPACT = "compact"
VIEW_BARE = "bare"
VALID_VIEWS = (VIEW_NORMAL, VIEW_COMPACT, VIEW_BARE)

US_QWERTY_CODES: dict[str, str] = {
    **{chr(c): f"Key{chr(c - 32)}" for c in range(ord("a"), ord("z") + 1)},
    **{chr(c): f"Shift+Key{chr(c)}" for c in range(ord("A"), ord("Z") + 1)},
    " ": "Space",
    ",": "Comma",
    ".": "Period",
    ";": "Semicolon",
    "/": "Slash",
    "?": "Shift+Slash",
    "!": "Shift+Digit1",
    "<": "Shift+Comma",
    ">": "Shift+Period",
}


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def kill_process_tree(pid: int) -> None:
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        with contextlib.suppress(ProcessLookupError):
            os.kill(pid, 9)


def http_get_json(url: str, timeout: float = 10.0) -> tuple[int, Any]:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        return resp.status, json.loads(raw)


def http_get_text(url: str, timeout: float = 10.0) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8")


@contextlib.contextmanager
def run_isolated_server() -> Iterator[tuple[str, Path]]:
    """Start an isolated temporary root/index.js server on ephemeral ports."""
    if not SERVER_ENTRY.exists():
        raise FileNotFoundError(f"Server entry not found: {SERVER_ENTRY}")

    http_port = find_free_port()
    ws_port = find_free_port()
    while ws_port == http_port:
        ws_port = find_free_port()

    with tempfile.TemporaryDirectory(prefix="keybr_e2e_srv_") as tmp:
        tmp_path = Path(tmp)
        data_dir = tmp_path / "data"
        keytrace_dir = tmp_path / "keytrace"
        db_file = tmp_path / "keybr.sqlite"
        data_dir.mkdir(parents=True, exist_ok=True)
        keytrace_dir.mkdir(parents=True, exist_ok=True)

        env = os.environ.copy()
        env.update(
            {
                "NODE_ENV": "production",
                "SERVER_HOST": "127.0.0.1",
                "SERVER_PORT": str(http_port),
                "SERVER_PORT_WS": str(ws_port),
                "APP_URL": f"http://localhost:{http_port}/",
                "COOKIE_SECURE": "false",
                "COOKIE_DOMAIN": "localhost",
                "DATABASE_CLIENT": "sqlite",
                "DATABASE_FILENAME": str(db_file),
                "DATA_DIR": str(data_dir),
                "KEYTRACE_EVENTS_DIR": str(keytrace_dir),
                "MAIL_DOMAIN": "localhost",
                "MAIL_KEY": "dummy",
            }
        )

        # Raise Node's default 5s HTTP keepAliveTimeout in the ephemeral test server so
        # long typing sessions (e.g. 8s Quanpin drills) never race with Chromium's keep-alive
        # socket pool and emit spurious net::ERR_CONNECTION_CLOSED console errors.
        keepalive_preload = tmp_path / "_e2e_keepalive.cjs"
        keepalive_preload.write_text(
            "const http = require('node:http');\n"
            "const origListen = http.Server.prototype.listen;\n"
            "http.Server.prototype.listen = function (...args) {\n"
            "  this.keepAliveTimeout = 65000;\n"
            "  this.headersTimeout = 66000;\n"
            "  return origListen.apply(this, args);\n"
            "};\n",
            encoding="utf-8",
        )

        proc = subprocess.Popen(
            [
                "node",
                "--experimental-sqlite",
                "--require",
                str(keepalive_preload),
                str(SERVER_ENTRY),
            ],
            cwd=str(tmp_path),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        base_url = f"http://localhost:{http_port}"
        try:
            deadline = time.monotonic() + 25.0
            last_err: Exception | None = None
            while time.monotonic() < deadline:
                if proc.poll() is not None:
                    out = proc.stdout.read().decode("utf-8", errors="replace") if proc.stdout else ""
                    err = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
                    raise RuntimeError(
                        f"Isolated server exited early ({proc.returncode}): {out}\n{err}"
                    )
                try:
                    status, _ = http_get_text(f"{base_url}/", timeout=2.0)
                    if status == 200:
                        break
                except Exception as exc:  # noqa: BLE001
                    last_err = exc
                    time.sleep(0.15)
            else:
                raise TimeoutError(f"Isolated server failed to become ready: {last_err}")

            yield base_url, keytrace_dir
        finally:
            kill_process_tree(proc.pid)
            with contextlib.suppress(Exception):
                proc.wait(timeout=5)
            if proc.stdout:
                with contextlib.suppress(Exception):
                    proc.stdout.close()
            if proc.stderr:
                with contextlib.suppress(Exception):
                    proc.stderr.close()


def parse_rgb(color_str: str | None) -> tuple[int, int, int] | None:
    if not color_str:
        return None
    m = re.search(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)", color_str)
    if m:
        return int(m.group(1)), int(m.group(2)), int(m.group(3))
    hex_m = re.fullmatch(r"#([0-9a-fA-F]{6})", color_str.strip())
    if hex_m:
        val = hex_m.group(1)
        return int(val[0:2], 16), int(val[2:4], 16), int(val[4:6], 16)
    return None


def rgb_close(a: str | None, b: str | None, tolerance: int = 8) -> bool:
    ra = parse_rgb(a)
    rb = parse_rgb(b)
    if ra is None or rb is None:
        return False
    return all(abs(x - y) <= tolerance for x, y in zip(ra, rb))


def rgb_brightness(color_str: str | None) -> float | None:
    rgb = parse_rgb(color_str)
    if rgb is None:
        return None
    r, g, b = rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _normalize_view_str(view: str | None) -> str | None:
    if view is None:
        return None
    low = str(view).strip().lower()
    if low not in VALID_VIEWS:
        raise ValueError(f"Invalid practice view {view!r}; expected one of {VALID_VIEWS}")
    return low


@contextlib.contextmanager
def open_context(
    browser: Browser,
    base_url: str,
    *,
    locale: str = "en-US",
    viewport: dict[str, int] | None = None,
    color_scheme: str | None = None,
    settings: dict[str, Any] | None = None,
    prefs_cookie: dict[str, str] | None = None,
    practice_view: str | None = None,
    zoomer_positions: dict[str, dict[str, float]] | None = None,
    show_code: dict[str, str] | None = None,
    keytrace_sync_ts: int | None = None,
    assert_clean: bool = True,
) -> Iterator[tuple[BrowserContext, Page, list[str], list[str]]]:
    """Create an isolated BrowserContext + Page with deterministic init state and error tracking."""
    vp = viewport or {"width": 1280, "height": 900}
    ctx_kwargs: dict[str, Any] = {"locale": locale, "viewport": vp}
    if color_scheme is not None:
        ctx_kwargs["color_scheme"] = color_scheme

    context = browser.new_context(**ctx_kwargs)

    # Stub external analytics, Cookiebot, and thirdparties-ads (pub.network) beacons so
    # offline/ephemeral hosts never hit external CDNs or emit spurious net::ERR_CONNECTION_CLOSED.
    def _stub_204(route: Any) -> None:
        route.fulfill(status=204, body="")

    context.route(
        re.compile(
            r"^https?://([^/]+\.)?(cloudflareinsights\.com|googletagmanager\.com|google-analytics\.com|consent\.cookiebot\.com|consentcdn\.cookiebot\.com|pub\.network|cdn-vitals\.com)/"
        ),
        _stub_204,
    )

    if prefs_cookie is not None:
        parsed = urllib.parse.urlparse(base_url)
        host = parsed.hostname or "localhost"
        context.add_cookies(
            [
                {
                    "name": "prefs",
                    "value": urllib.parse.quote(json.dumps(prefs_cookie, separators=(",", ":"))),
                    "domain": host,
                    "path": "/",
                    "sameSite": "Lax",
                }
            ]
        )

    norm_view = _normalize_view_str(practice_view)

    init_items: dict[str, str] = {}
    if settings is not None:
        init_items["settings"] = json.dumps(settings, separators=(",", ":"))
    if norm_view is not None:
        # enumProp("prefs.practice.view", View, View.Normal) serializes lowercase string names.
        init_items["prefs.practice.view"] = json.dumps(norm_view)
    if zoomer_positions is not None:
        init_items["keybr.zoomer.positions"] = json.dumps(zoomer_positions, separators=(",", ":"))
    if show_code is not None:
        for k, v in show_code.items():
            init_items[k] = str(v)
    if keytrace_sync_ts is not None:
        init_items["keybr.keytrace.lastSyncedTs"] = str(keytrace_sync_ts)
        init_items["keybr.keytrace.syncVersion"] = "4"

    if init_items:
        # Run only once on initial document load (guard with sessionStorage flag) so later in-page localStorage edits persist across reloads.
        items_json = json.dumps(init_items)
        context.add_init_script(
            f"""(() => {{
                if (!window.sessionStorage.getItem('__e2e_init_done__')) {{
                    const items = {items_json};
                    for (const [k, v] of Object.entries(items)) {{
                        window.localStorage.setItem(k, v);
                    }}
                    window.sessionStorage.setItem('__e2e_init_done__', '1');
                }}
            }})();"""
        )

    page = context.new_page()
    console_errors: list[str] = []
    page_errors: list[str] = []
    closing = False

    def _on_console(msg: Any) -> None:
        if not closing and msg.type == "error":
            console_errors.append(msg.text)

    def _on_pageerror(err: Any) -> None:
        if not closing:
            page_errors.append(str(err))

    page.on("console", _on_console)
    page.on("pageerror", _on_pageerror)

    failed = False
    try:
        yield context, page, console_errors, page_errors
    except Exception:
        failed = True
        raise
    finally:
        # Stop recording errors emitted solely by context.close() aborting lingering fetches.
        closing = True
        with contextlib.suppress(Exception):
            context.close()
        if assert_clean and not failed:
            if console_errors:
                raise AssertionError(f"Unexpected console.error(s): {console_errors}")
            if page_errors:
                raise AssertionError(f"Unexpected pageerror(s): {page_errors}")


# ---------------------------------------------------------------------------
# Preferences, cookies, storage, and basic DOM helpers
# ---------------------------------------------------------------------------


def get_html_attrs(page: Page) -> dict[str, str | None]:
    return page.evaluate(
        """() => ({
            lang: document.documentElement.getAttribute('lang'),
            color: document.documentElement.getAttribute('data-color'),
            font: document.documentElement.getAttribute('data-font'),
        })"""
    )


def get_prefs_cookie(context: BrowserContext) -> dict[str, Any] | None:
    for c in context.cookies():
        if c["name"] == "prefs":
            raw = urllib.parse.unquote(c["value"])
            return json.loads(raw)
    return None


def get_practice_view(page: Page) -> str:
    """Read enumProp('prefs.practice.view') string value ('normal'|'compact'|'bare')."""
    raw = page.evaluate("() => window.localStorage.getItem('prefs.practice.view')")
    if raw is None:
        return VIEW_NORMAL
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return VIEW_NORMAL
    if isinstance(parsed, str) and parsed in VALID_VIEWS:
        return parsed
    return VIEW_NORMAL


def get_zoomer_positions(page: Page) -> dict[str, Any] | None:
    raw = page.evaluate("() => window.localStorage.getItem('keybr.zoomer.positions')")
    if raw is None:
        return None
    return json.loads(raw)


def get_settings_storage(page: Page) -> dict[str, Any] | None:
    raw = page.evaluate("() => window.localStorage.getItem('settings')")
    if raw is None:
        return None
    return json.loads(raw)


def is_tour_open(page: Page) -> bool:
    return page.evaluate(
        """() => {
            const links = Array.from(document.querySelectorAll('main a'));
            return links.some(a => ['下一个', 'Next', '关闭', 'Close', '上一页', 'Previous'].includes((a.textContent || '').trim()));
        }"""
    )


def dismiss_tour_if_open(page: Page) -> None:
    if is_tour_open(page):
        page.keyboard.press("Escape")
        page.wait_for_function(
            """() => {
                const links = Array.from(document.querySelectorAll('main a'));
                return !links.some(a => ['下一个', 'Next', '关闭', 'Close'].includes((a.textContent || '').trim()));
            }""",
            timeout=5000,
        )


def wait_for_practice_ready(page: Page) -> None:
    page.locator('main [role="group"] button').first.wait_for(state="visible", timeout=15000)


def ensure_practice_language(page: Page, lang: str) -> None:
    """Click ZH (index 0) or EN (index 1) quick-toggle button if not already active."""
    wait_for_practice_ready(page)
    idx = 0 if lang == "zh" else 1
    btn = page.locator('main [role="group"] button').nth(idx)
    if btn.get_attribute("aria-pressed") != "true":
        btn.click()
    expect(btn).to_have_attribute("aria-pressed", "true", timeout=10000)
    if lang == "zh":
        page.locator("main [data-scheme]").wait_for(state="visible", timeout=10000)
    else:
        page.locator('main div[dir="ltr"]').first.wait_for(state="visible", timeout=10000)
    # If Normal view is active, wait for DeferredKeyboardPresenter to mount the keyboard SVG.
    if get_practice_view(page) == VIEW_NORMAL:
        page.wait_for_function(
            "() => document.querySelector('main section svg[height=\"23rem\"]') !== null",
            timeout=10000,
        )


def get_toolbar_buttons(page: Page) -> Locator:
    return page.locator("nav div:nth-of-type(1) > button")


def get_theme_button(page: Page) -> Locator:
    return page.locator("nav div:nth-of-type(1) > button:nth-of-type(1)")


def get_help_button(page: Page) -> Locator:
    return page.locator('main button[title*="幻灯片"], main button[title*="guided tour"]')


def get_view_switch_button(page: Page) -> Locator:
    return page.locator('main button[title*="界面布局"], main button[title*="interface layout"]')


def get_reset_button(page: Page) -> Locator:
    return page.locator('main button[title*="重置当前练习"], main button[title*="Reset current practice"]')


def get_skip_button(page: Page) -> Locator:
    # Match ZH ("换一组练习文本...") and EN ("Skip to new words...")
    return page.locator('main button[title*="换一组练习文本"], main button[title*="Skip to new words"]')


def get_settings_button(page: Page) -> Locator:
    return page.locator('main button[title*="练习设置"], main button[title*="practice settings"]')


def skip_lesson(page: Page) -> None:
    btn = get_skip_button(page)
    btn.wait_for(state="visible", timeout=15000)
    btn.click()
    page.wait_for_timeout(120)


# ---------------------------------------------------------------------------
# Settings navigation & controls
# ---------------------------------------------------------------------------


def open_settings(page: Page) -> None:
    btn = get_settings_button(page)
    btn.wait_for(state="visible", timeout=15000)
    btn.click()
    page.locator("main fieldset:nth-of-type(4)").wait_for(state="visible", timeout=10000)


def save_settings(page: Page) -> None:
    btn = page.locator('main button:has-text("完成"), main button:has-text("Done")').first
    btn.wait_for(state="visible", timeout=10000)
    btn.click()
    wait_for_practice_ready(page)


def reset_settings(page: Page) -> None:
    btn = page.locator('main button:has-text("重置"), main button:has-text("Reset")').first
    btn.wait_for(state="visible", timeout=10000)
    btn.click()


def select_zh_scheme(page: Page, scheme_label_pattern: str) -> None:
    """In SettingsScreen, select Chinese language and a specific scheme from fieldset 6."""
    fs6 = page.locator("main fieldset:nth-of-type(6)")
    fs6.wait_for(state="visible", timeout=10000)
    lang_btn = fs6.locator('span[tabindex="0"]').nth(0)
    lang_btn.click()
    page.locator('ul[role="menu"]').wait_for(state="visible", timeout=5000)
    page.locator('ul[role="menu"] li[role="menuitem"]').filter(
        has_text=re.compile(r"^(中文|Chinese)$")
    ).first.click()

    scheme_btn = fs6.locator('span[tabindex="0"]').nth(1)
    scheme_btn.wait_for(state="visible", timeout=5000)
    scheme_btn.click()
    page.locator('ul[role="menu"]').wait_for(state="visible", timeout=5000)
    page.locator('ul[role="menu"] li[role="menuitem"]').filter(
        has_text=re.compile(scheme_label_pattern)
    ).first.click()


def set_typing_options(
    page: Page,
    *,
    stop_on_error: bool | None = None,
    forgive_errors: bool | None = None,
    space_skips_words: bool | None = None,
) -> None:
    fs4 = page.locator("main fieldset:nth-of-type(4)")
    fs4.wait_for(state="visible", timeout=10000)
    labels = fs4.locator("label")
    mapping = [
        (0, stop_on_error),
        (1, forgive_errors),
        (2, space_skips_words),
    ]
    for idx, desired in mapping:
        if desired is not None:
            lbl = labels.nth(idx)
            cb = lbl.locator('input[type="checkbox"]')
            if cb.is_checked() != desired:
                lbl.click()
            expect(cb).to_be_checked(checked=desired)


def set_fuzzy_options(page: Page, labels: dict[str, bool]) -> None:
    fs1 = page.locator("main fieldset:nth-of-type(1)")
    fs1.wait_for(state="visible", timeout=10000)
    for label_text, desired in labels.items():
        lbl = fs1.locator("label").filter(has_text=label_text).first
        lbl.wait_for(state="visible", timeout=5000)
        cb = lbl.locator('input[type="checkbox"]')
        if cb.is_checked() != desired:
            lbl.click()
        expect(cb).to_be_checked(checked=desired)


def set_punctuation_slider(page: Page, percent: int) -> None:
    """Set punctuation ratio slider (0 to 100) in fieldset 1."""
    fs1 = page.locator("main fieldset:nth-of-type(1)")
    fs1.wait_for(state="visible", timeout=10000)
    row = fs1.locator("div").filter(has_text=re.compile(r"标点符号|punctuation")).first
    slider = row.locator('input[type="range"]').first
    slider.fill(str(int(percent)))


def set_lesson_length_slider(page: Page, percent: int) -> None:
    """Set lesson length slider (1 to 100) in fieldset 1."""
    fs1 = page.locator("main fieldset:nth-of-type(1)")
    fs1.wait_for(state="visible", timeout=10000)
    row = fs1.locator("div").filter(has_text=re.compile(r"每轮词数|单词量|Word list size")).first
    slider = row.locator('input[type="range"]').first
    slider.fill(str(int(percent)))


def select_settings_font(page: Page, font_name_pattern: str) -> str:
    """In SettingsScreen fieldset 5 (Text appearance), open Font OptionList and pick a font."""
    fs5 = page.locator("main fieldset:nth-of-type(5)")
    fs5.wait_for(state="visible", timeout=10000)
    font_btn = fs5.locator('span[tabindex="0"]').first
    font_btn.click()
    page.locator('ul[role="menu"]').wait_for(state="visible", timeout=5000)
    item = page.locator('ul[role="menu"] li[role="menuitem"]').filter(
        has_text=re.compile(font_name_pattern)
    ).first
    chosen_text = (item.inner_text() or "").strip()
    item.click()
    return chosen_text


# ---------------------------------------------------------------------------
# Focus & Typing drivers
# ---------------------------------------------------------------------------


def focus_zh_input(page: Page) -> None:
    tb = page.locator('main [role="textbox"]').first
    tb.wait_for(state="visible", timeout=10000)
    # Click a hanzi unit if present, else focus textbox directly
    hanzi = page.locator('main [data-scheme] [data-hanzi="1"]').first
    if hanzi.count() > 0:
        hanzi.click()
    else:
        tb.click()
    page.wait_for_function(
        """() => {
            const txt = document.body.innerText || '';
            return !txt.includes('单击或按 Enter 键激活') && !txt.includes('Click or press Enter to activate');
        }""",
        timeout=5000,
    )


def focus_en_input(page: Page) -> None:
    ta = page.locator("main textarea").first
    ta.wait_for(state="attached", timeout=10000)
    ltr = page.locator('main div[dir="ltr"]').first
    if ltr.count() > 0:
        ltr.click()
    else:
        ta.focus()
    page.wait_for_function(
        """() => {
            const txt = document.body.innerText || '';
            return !txt.includes('单击或按 Enter 键激活') && !txt.includes('Click or press Enter to activate');
        }""",
        timeout=5000,
    )


def press_char(page: Page, ch: str) -> None:
    code = US_QWERTY_CODES.get(ch)
    if code is None:
        raise ValueError(f"Unsupported key character for US_QWERTY_CODES: {ch!r}")
    page.keyboard.press(code)


def type_key_stream(
    page: Page,
    keys: str,
    *,
    per_key_ms: float = 0.0,
    min_total_ms: float = 0.0,
) -> None:
    """Type an ASCII key stream via trusted KeyboardEvent codes."""
    n = len(keys)
    effective_per_key = per_key_ms
    if min_total_ms > 0 and n > 0:
        effective_per_key = max(effective_per_key, min_total_ms / n)

    start = time.monotonic()
    for i, ch in enumerate(keys):
        press_char(page, ch)
        if effective_per_key > 0 and i < n - 1:
            target_elapsed = (i + 1) * (effective_per_key / 1000.0)
            now_elapsed = time.monotonic() - start
            if target_elapsed > now_elapsed:
                time.sleep(target_elapsed - now_elapsed)


# ---------------------------------------------------------------------------
# ZhLines DOM inspection
# ---------------------------------------------------------------------------


def read_zh_lesson_tokens(page: Page) -> dict[str, Any]:
    """Read current ZhLines DOM tokens, codes, hanzi, spaces, and cursor state."""
    return page.evaluate(
        """() => {
            const root = document.querySelector('main [data-scheme]');
            if (!root) return null;
            const scheme = root.getAttribute('data-scheme');
            const lines = Array.from(root.querySelectorAll('div[style*="z-index: 1"]'));
            const words = [];
            const tokens = [];
            for (const line of lines) {
                for (const child of Array.from(line.children)) {
                    if (child.getAttribute('data-word') === '1') {
                        const unitEls = Array.from(child.querySelectorAll('[data-unit="1"]'));
                        const units = unitEls.map(u => {
                            const codeEl = u.querySelector('[data-code="1"]');
                            const hanziEl = u.querySelector('[data-hanzi="1"]');
                            const code = codeEl ? (codeEl.textContent || '') : '';
                            const hanzi = hanziEl ? (hanziEl.textContent || '') : '';
                            const segs = parseInt(u.getAttribute('data-segments') || '0', 10);
                            const isCursor = u.getAttribute('data-cursor') === '1';
                            const garbage = parseInt(u.getAttribute('data-garbage') || '0', 10);
                            const errorCount = parseInt(u.getAttribute('data-error-count') || '0', 10);
                            const badgeEl = u.querySelector('[data-garbage-badge="1"]');
                            const badgeText = badgeEl ? (badgeEl.textContent || '').trim() : null;
                            const cs = hanziEl ? window.getComputedStyle(hanziEl) : null;
                            return {
                                code,
                                hanzi,
                                segments: segs,
                                cursor: isCursor,
                                garbage,
                                errorCount,
                                badgeText,
                                hanziColor: cs ? cs.color : null,
                                hanziBgImage: cs ? cs.backgroundImage : null,
                                fontFamily: cs ? cs.fontFamily : null,
                            };
                        });
                        const spEl = child.querySelector('[data-space="1"]');
                        const hasSpace = Boolean(spEl);
                        const spaceCursor = spEl ? spEl.getAttribute('data-cursor') === '1' : false;
                        const spaceGarbage = spEl ? parseInt(spEl.getAttribute('data-garbage') || '0', 10) : 0;
                        const spaceErrorCount = spEl ? parseInt(spEl.getAttribute('data-error-count') || '0', 10) : 0;
                        const spBadgeEl = spEl ? spEl.querySelector('[data-garbage-badge="1"]') : null;
                        const spaceBadgeText = spBadgeEl ? (spBadgeEl.textContent || '').trim() : null;
                        const spaceColor = spEl ? window.getComputedStyle(spEl).color : null;
                        const bodyCode = units.map(u => u.code).join('');
                        const fullHanzi = units.map(u => u.hanzi).join('');
                        words.push({
                            units,
                            bodyCode,
                            fullHanzi,
                            hasSpace,
                            spaceCursor,
                            spaceGarbage,
                            spaceErrorCount,
                            spaceBadgeText,
                            spaceColor,
                        });
                        tokens.push(bodyCode + (hasSpace ? ' ' : ''));
                    } else if (child.getAttribute('data-space') === '1') {
                        tokens.push(' ');
                    }
                }
            }
            const cursorEl = root.querySelector('[data-caret-shape]');
            const cursorSegEls = cursorEl ? Array.from(cursorEl.querySelectorAll('[data-cursor-segment]')) : [];
            const cursorSegColors = cursorSegEls.map(el => window.getComputedStyle(el).backgroundColor);
            const hasMissAnywhere = Boolean(
                Array.from(root.querySelectorAll('span')).find(s => window.getComputedStyle(s).color === 'rgb(212, 80, 58)')
            );
            return {
                scheme,
                words,
                fullStream: tokens.join(''),
                cursorActiveIndex: cursorEl ? parseInt(cursorEl.getAttribute('data-cursor-active-index') || '0', 10) : null,
                cursorSegments: cursorEl ? parseInt(cursorEl.getAttribute('data-cursor-segments') || '0', 10) : null,
                cursorError: cursorEl ? cursorEl.getAttribute('data-cursor-error') === '1' : false,
                cursorSegColors,
                hasMissAnywhere,
            };
        }"""
    )


def read_en_lesson_text(page: Page) -> str:
    return page.evaluate(
        """() => {
            const lines = Array.from(document.querySelectorAll('main div[dir="ltr"]'));
            const raw = lines.map(el => el.textContent || '').join('');
            return raw.replace(/[\\uE000\\uE001\\u00A0]/g, ' ');
        }"""
    )


# ---------------------------------------------------------------------------
# Bounding-box layout shift & Tour geometry helpers
# ---------------------------------------------------------------------------


def measure_practice_boxes(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """() => {
            const rect = (el) => {
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: r.x, y: r.y, width: r.width, height: r.height };
            };
            const mainEl = document.querySelector('main');
            const secEl = document.querySelector('main section');
            const grpBtn0 = document.querySelector('main [role="group"] button:nth-of-type(1)');
            const grpBtn1 = document.querySelector('main [role="group"] button:nth-of-type(2)');
            const controlsEl = grpBtn0 ? grpBtn0.closest('div')?.parentElement : null;
            let indicatorsEl = null;
            if (secEl) {
                for (const child of Array.from(secEl.children)) {
                    const txt = child.innerText || '';
                    if (txt.includes('衡量标准') || txt.includes('Metrics')) {
                        indicatorsEl = child;
                        break;
                    }
                }
            }
            const taInput = document.querySelector('main [role="textbox"], main textarea');
            // TextArea.tsx wraps <TextEvents> (div > input) inside <div className={styles.root}>
            const textAreaEl = taInput && taInput.parentElement ? taInput.parentElement.parentElement : null;
            const textContentEl = document.querySelector('main [data-scheme], main div[dir="ltr"]');
            const kbSvg = document.querySelector('main section svg[height="23rem"]');
            const keyboardEl = kbSvg ? kbSvg.parentElement : null;
            return {
                main: rect(mainEl),
                controls: rect(controlsEl),
                indicators: rect(indicatorsEl),
                textArea: rect(textAreaEl),
                textContent: rect(textContentEl),
                textAreaScrollHeight: textAreaEl ? textAreaEl.scrollHeight : null,
                textAreaClientHeight: textAreaEl ? textAreaEl.clientHeight : null,
                keyboard: rect(keyboardEl),
                zhBtn: rect(grpBtn0),
                enBtn: rect(grpBtn1),
                clientWidth: document.documentElement.clientWidth,
                scrollY: window.scrollY,
            };
        }"""
    )


def max_box_delta(a: dict[str, Any], b: dict[str, Any], keys: tuple[str, ...] | None = None) -> float:
    check_keys = keys or ("main", "controls", "indicators", "textArea", "keyboard", "zhBtn", "enBtn")
    max_d = 0.0
    for k in check_keys:
        ra = a.get(k)
        rb = b.get(k)
        if ra is None and rb is None:
            continue
        if ra is None or rb is None:
            return 9999.0
        for field in ("x", "y", "width", "height"):
            d = abs(float(ra[field]) - float(rb[field]))
            if d > max_d:
                max_d = d
    if "clientWidth" in a and "clientWidth" in b:
        max_d = max(max_d, abs(float(a["clientWidth"]) - float(b["clientWidth"])))
    return max_d


def max_chrome_delta(
    a: dict[str, Any],
    b: dict[str, Any],
    chrome_keys: tuple[str, ...] = ("controls", "indicators", "zhBtn", "enBtn"),
    anchor_keys: tuple[str, ...] = ("main", "textArea"),
) -> float:
    max_d = 0.0
    for k in chrome_keys:
        ra = a.get(k)
        rb = b.get(k)
        if ra is None and rb is None:
            continue
        if ra is None or rb is None:
            return 9999.0
        for field in ("x", "y", "width", "height"):
            d = abs(float(ra[field]) - float(rb[field]))
            if d > max_d:
                max_d = d
    for k in anchor_keys:
        ra = a.get(k)
        rb = b.get(k)
        if ra is None and rb is None:
            continue
        if ra is None or rb is None:
            return 9999.0
        for field in ("x", "y", "width"):
            d = abs(float(ra[field]) - float(rb[field]))
            if d > max_d:
                max_d = d
    if "clientWidth" in a and "clientWidth" in b:
        max_d = max(max_d, abs(float(a["clientWidth"]) - float(b["clientWidth"])))
    return max_d


def read_zoomer_styles(page: Page) -> dict[str, dict[str, Any]]:
    """Read inline style left/top/transform from Zoomer wrappers inside main section."""
    return page.evaluate(
        """() => {
            const out = {};
            const sec = document.querySelector('main section');
            if (!sec) return out;
            const divs = Array.from(sec.querySelectorAll('div[style*="position: relative"]'));
            for (const d of divs) {
                const st = d.style;
                if (!st.transform || !st.transform.includes('scale(')) continue;
                const txt = d.innerText || '';
                let key = null;
                if (txt.includes('衡量标准') || txt.includes('Metrics')) {
                    key = 'indicators';
                } else if (d.querySelector('[role="textbox"], textarea, [data-scheme], div[dir="ltr"]')) {
                    key = 'textArea';
                } else if (d.querySelector('svg[height="23rem"]')) {
                    key = 'keyboard';
                }
                if (key) {
                    out[key] = {
                        left: parseFloat(st.left || '0') || 0,
                        top: parseFloat(st.top || '0') || 0,
                        transform: st.transform,
                    };
                }
            }
            return out;
        }"""
    )


def measure_tour_spotlight_and_anchor(page: Page, slide_index: int) -> dict[str, Any]:
    """Resolve expected anchor element rect, Spotlight marker rect, and Tour popup rect for slide 4..11."""
    return page.evaluate(
        """(slideIdx) => {
            const rect = (el) => {
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: r.x, y: r.y, width: r.width, height: r.height };
            };
            // Resolve anchor by semantic structure matching PracticeTour.tsx slides 4..11
            let anchorEl = null;
            if (slideIdx === 4) {
                const taInput = document.querySelector('main [role="textbox"], main textarea');
                anchorEl = taInput ? taInput.closest('section > div') : null;
            } else if (slideIdx === 5) {
                const kbSvg = document.querySelector('main section svg[height="23rem"]');
                anchorEl = kbSvg ? kbSvg.closest('section > div') : null;
            } else if (slideIdx >= 6 && slideIdx <= 11) {
                const labelMap = {
                    6: ['输入速度', 'Speed'],
                    7: ['准确度', 'Accuracy'],
                    8: ['分数', 'Score'],
                    9: ['所有键位', 'All keys'],
                    10: ['所有键位', 'All keys'],
                    11: ['当前字符', 'Current key'],
                };
                const targets = labelMap[slideIdx] || [];
                const spans = Array.from(document.querySelectorAll('main section span'));
                for (const sp of spans) {
                    const clean = (sp.textContent || '').trim().replace(/[:：]\\s*$/, '');
                    if (targets.includes(clean)) {
                        anchorEl = slideIdx <= 8 ? sp.parentElement : (sp.nextElementSibling || sp.parentElement);
                        break;
                    }
                }
            }

            // Locate Tour Popup & Spotlight inside main portal container
            let popupEl = null;
            let markerEl = null;
            const mainDivs = Array.from(document.querySelectorAll('main div'));
            for (const d of mainDivs) {
                const st = window.getComputedStyle(d);
                if (st.position === 'fixed' && st.zIndex === '1') {
                    if (d.querySelector('a') && (d.innerText.includes('下一个') || d.innerText.includes('Next') || d.innerText.includes('关闭') || d.innerText.includes('Close'))) {
                        popupEl = d;
                    }
                }
            }
            // Spotlight renders 5 child divs (c1, c2, c3, c4, marker) inside fixed wrapper
            for (const d of mainDivs) {
                const st = window.getComputedStyle(d);
                if (st.position === 'fixed' && d.children.length === 5) {
                    const last = d.children[4];
                    if (last && last.tagName === 'DIV' && last.style.width && last.style.height) {
                        markerEl = last;
                        break;
                    }
                }
            }

            return {
                anchorRect: rect(anchorEl),
                markerRect: rect(markerEl),
                popupRect: rect(popupEl),
                viewport: { width: window.innerWidth, height: window.innerHeight },
            };
        }""",
        slide_index,
    )


# ---------------------------------------------------------------------------
# IndexedDB seeding / reading & KeyTrace JSONL helpers
# ---------------------------------------------------------------------------


def make_result_json(
    layout: str = "en-us",
    *,
    ts: int | None = None,
    length: int = 40,
    time_ms: int = 12000,
    errors: int = 0,
    histogram: dict[int, tuple[int, int, int]] | None = None,
    mode: str = "generated",
) -> dict[str, Any]:
    """Construct a valid ResultJson record (>= 3 histogram keys, >= 10 chars, >= 1000ms)."""
    if ts is None:
        ts = int(time.time() * 1000) - 60_000
    if histogram is None:
        histogram = {
            ord("e"): (10, 0, 220),
            ord("n"): (10, 0, 240),
            ord("i"): (10, 0, 250),
        }
    h_json = {
        str(cp): {"h": int(h), "m": int(m), "t": int(t)}
        for cp, (h, m, t) in histogram.items()
    }
    return {
        "l": layout,
        "m": mode,
        "ts": int(ts),
        "n": int(length),
        "t": int(time_ms),
        "e": int(errors),
        "h": h_json,
    }


def seed_indexeddb_results(page: Page, records: list[dict[str, Any]]) -> int:
    return page.evaluate(
        """async (recs) => {
            const db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('history', 1);
                req.onupgradeneeded = () => {
                    const d = req.result;
                    if (!d.objectStoreNames.contains('history')) {
                        d.createObjectStore('history', { autoIncrement: true });
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            await new Promise((resolve, reject) => {
                const tx = db.transaction('history', 'readwrite');
                const store = tx.objectStore('history');
                for (const r of recs) {
                    store.add(r);
                }
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            const count = await new Promise((resolve, reject) => {
                const tx = db.transaction('history', 'readonly');
                const req = tx.objectStore('history').count();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            db.close();
            return count;
        }""",
        records,
    )


def read_indexeddb_results(page: Page) -> list[dict[str, Any]]:
    return page.evaluate(
        """async () => {
            const db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('history', 1);
                req.onupgradeneeded = () => {
                    const d = req.result;
                    if (!d.objectStoreNames.contains('history')) {
                        d.createObjectStore('history', { autoIncrement: true });
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            const all = await new Promise((resolve, reject) => {
                const tx = db.transaction('history', 'readonly');
                const req = tx.objectStore('history').getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
            db.close();
            return all;
        }"""
    )


def wait_for_indexeddb_count(page: Page, min_count: int, timeout_ms: int = 8000) -> list[dict[str, Any]]:
    deadline = time.monotonic() + timeout_ms / 1000.0
    while time.monotonic() < deadline:
        recs = read_indexeddb_results(page)
        if len(recs) >= min_count:
            return recs
        time.sleep(0.15)
    recs = read_indexeddb_results(page)
    raise TimeoutError(f"Expected >= {min_count} IndexedDB results, got {len(recs)}: {recs}")


def build_realistic_keytrace_events(
    *,
    base_ts: int,
    tokens: list[tuple[str, float, int]],
    session_id: int = 1,
    app: str = "Code.exe",
) -> list[dict[str, Any]]:
    """Build valid KeyTrace JSONL events (v=1, meta, kd with sc>0, and commit) for realistic sync testing."""
    session_start = base_ts - 100
    events: list[dict[str, Any]] = [
        {
            "v": 1,
            "ev": "meta",
            "ts": session_start,
            "mono": 1000.0,
            "sid": session_id,
            "sessionStartTs": session_start,
            "app": app,
        }
    ]
    mono = 1100.0
    ts = base_ts
    for text, step_ms, backspaces in tokens:
        kd_count = 0
        for i, ch in enumerate(text):
            mono += step_ms if i > 0 else 180.0
            ts += int(step_ms if i > 0 else 180)
            vk = ord(ch.upper()) if ch.isalpha() else 32
            events.append(
                {
                    "v": 1,
                    "ev": "kd",
                    "ts": ts,
                    "mono": round(mono, 2),
                    "sid": session_id,
                    "sessionStartTs": session_start,
                    "app": app,
                    "sc": 30 + (i % 15),
                    "vk": vk,
                    "mods": 0,
                }
            )
            kd_count += 1
        for _ in range(backspaces):
            mono += 110.0
            ts += 110
            events.append(
                {
                    "v": 1,
                    "ev": "kd",
                    "ts": ts,
                    "mono": round(mono, 2),
                    "sid": session_id,
                    "sessionStartTs": session_start,
                    "app": app,
                    "sc": 14,
                    "vk": 8,
                    "mods": 0,
                }
            )
            kd_count += 1
        events.append(
            {
                "v": 1,
                "ev": "commit",
                "ts": ts + 10,
                "mono": round(mono + 10.0, 2),
                "sid": session_id,
                "sessionStartTs": session_start,
                "app": app,
                "text": text,
                "keys": kd_count,
            }
        )
    return events


def write_keytrace_jsonl(keytrace_dir: Path, date_str: str, events: list[dict[str, Any]]) -> Path:
    keytrace_dir.mkdir(parents=True, exist_ok=True)
    out = keytrace_dir / f"{date_str}.jsonl"
    lines = [json.dumps(ev, ensure_ascii=False) for ev in events]
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out


# ---------------------------------------------------------------------------
# /profile readers
# ---------------------------------------------------------------------------


def _wait_for_mastery_ready(page: Page) -> None:
    page.wait_for_function(
        """() => {
            const figs = Array.from(document.querySelectorAll('main figure'));
            for (const f of figs) {
                const cap = f.querySelector('figcaption');
                if (cap && (cap.textContent.includes('键位掌握度') || cap.textContent.includes('Key Mastery'))) {
                    const swatches = f.querySelectorAll('i');
                    const tiles = f.querySelectorAll('div[style*="width: 58px"]');
                    return swatches.length >= 5 && tiles.length >= 26;
                }
            }
            return false;
        }""",
        timeout=15000,
    )


def read_mastery_legend(page: Page) -> dict[str, str]:
    _wait_for_mastery_ready(page)
    return page.evaluate(
        """() => {
            const figs = Array.from(document.querySelectorAll('main figure'));
            for (const f of figs) {
                const cap = f.querySelector('figcaption');
                if (cap && (cap.textContent.includes('键位掌握度') || cap.textContent.includes('Key Mastery'))) {
                    const out = {};
                    for (const sp of Array.from(f.querySelectorAll('span'))) {
                        const swatch = sp.querySelector('i');
                        if (!swatch) continue;
                        const bg = window.getComputedStyle(swatch).backgroundColor;
                        const txt = (sp.textContent || '').trim();
                        if (txt.includes('未达标') || txt.includes('Below target')) out.weak = bg;
                        else if (txt.includes('60')) out.mid = bg;
                        else if (txt.includes('85')) out.good = bg;
                        else if (txt.includes('已达标') || txt.includes('Target reached')) out.done = bg;
                        else if (txt.includes('没有数据') || txt.includes('No data')) out.none = bg;
                    }
                    return out;
                }
            }
            return {};
        }"""
    )


def read_mastery_tiles(page: Page) -> dict[str, dict[str, Any]]:
    _wait_for_mastery_ready(page)
    return page.evaluate(
        """() => {
            const figs = Array.from(document.querySelectorAll('main figure'));
            for (const f of figs) {
                const cap = f.querySelector('figcaption');
                if (cap && (cap.textContent.includes('键位掌握度') || cap.textContent.includes('Key Mastery'))) {
                    const out = {};
                    const tiles = Array.from(f.querySelectorAll('div[style*="width: 58px"]'));
                    for (const t of tiles) {
                        const letterDiv = t.children[0];
                        if (!letterDiv) continue;
                        const letter = (letterDiv.textContent || '').trim();
                        const track = t.children[t.children.length - 1];
                        const fill = track ? track.children[0] : null;
                        const cs = fill ? window.getComputedStyle(fill) : null;
                        out[letter] = {
                            title: t.getAttribute('title') || '',
                            bg: cs ? cs.backgroundColor : null,
                            widthStyle: fill ? fill.style.width : null,
                        };
                    }
                    return out;
                }
            }
            return {};
        }"""
    )


def read_key_selector_tiles(page: Page) -> dict[int, dict[str, Any]]:
    """Wait for >= 26 KeySelector tiles and return {codePoint: {text, bg}}."""
    page.wait_for_function(
        "() => document.querySelectorAll('main span[data-code-point]').length >= 26",
        timeout=15000,
    )
    raw = page.evaluate(
        """() => {
            const out = {};
            const els = Array.from(document.querySelectorAll('main span[data-code-point]'));
            for (const el of els) {
                const cp = el.getAttribute('data-code-point');
                const cs = window.getComputedStyle(el);
                out[cp] = {
                    text: (el.textContent || '').trim(),
                    bg: cs.backgroundColor,
                };
            }
            return out;
        }"""
    )
    return {int(k): v for k, v in raw.items()}


def read_summary_stats(page: Page, heading_pattern: str) -> dict[str, str]:
    page.locator("main h2").first.wait_for(state="visible", timeout=15000)
    return page.evaluate(
        """(pat) => {
            const re = new RegExp(pat);
            const h2s = Array.from(document.querySelectorAll('main h2'));
            for (const h of h2s) {
                if (re.test(h.textContent || '')) {
                    const p = h.nextElementSibling;
                    if (!p) return {};
                    const out = {};
                    for (const item of Array.from(p.children)) {
                        const spans = item.querySelectorAll('span');
                        if (spans.length >= 2) {
                            const k = (spans[0].textContent || '').trim().replace(/[:：]\\s*$/, '');
                            const v = (spans[1].textContent || '').trim();
                            out[k] = v;
                        }
                    }
                    return out;
                }
            }
            return {};
        }""",
        heading_pattern,
    )


def select_profile_grouper(
    page: Page,
    *,
    layout_pattern: str | None = None,
    char_class_pattern: str | None = None,
) -> None:
    if layout_pattern is not None:
        opt = page.locator('main span[tabindex="0"]').nth(0)
        opt.wait_for(state="visible", timeout=10000)
        opt.click()
        page.locator('ul[role="menu"]').wait_for(state="visible", timeout=5000)
        page.locator('ul[role="menu"] li[role="menuitem"]').filter(
            has_text=re.compile(layout_pattern)
        ).first.click()
    if char_class_pattern is not None:
        opt = page.locator('main span[tabindex="0"]').nth(1)
        opt.wait_for(state="visible", timeout=10000)
        opt.click()
        page.locator('ul[role="menu"]').wait_for(state="visible", timeout=5000)
        page.locator('ul[role="menu"] li[role="menuitem"]').filter(
            has_text=re.compile(char_class_pattern)
        ).first.click()
    # Wait for async PhoneticModelLoader / KeySelector / MasterySection stabilization
    page.wait_for_function(
        "() => document.querySelectorAll('main span[data-code-point]').length >= 5 || document.querySelectorAll('main div[style*=\"width: 58px\"]').length >= 10",
        timeout=15000,
    )


# ---------------------------------------------------------------------------
# Practice KeySet, Settings target-speed / keytrace-mode, EN error badge, and Toast helpers
# ---------------------------------------------------------------------------


def read_practice_key_set(page: Page) -> dict[str, Any]:
    """Read unlocked/locked/forced/focused state from Practice Indicators KeySet & CurrentKey rows."""
    page.wait_for_function(
        """() => {
            const spans = Array.from(document.querySelectorAll('main section span'));
            for (const sp of spans) {
                const clean = (sp.textContent || '').trim().replace(/[:：]\\s*$/, '');
                if (clean === '所有键位' || clean === 'All keys') {
                    const ks = sp.nextElementSibling;
                    return Boolean(ks && ks.querySelectorAll('span[data-code-point]').length >= 26);
                }
            }
            return false;
        }""",
        timeout=15000,
    )
    return page.evaluate(
        """() => {
            const spans = Array.from(document.querySelectorAll('main section span'));
            let keySetEl = null;
            let currentKeyEl = null;
            for (const sp of spans) {
                const clean = (sp.textContent || '').trim().replace(/[:：]\\s*$/, '');
                if (!keySetEl && (clean === '所有键位' || clean === 'All keys')) {
                    keySetEl = sp.nextElementSibling;
                } else if (!currentKeyEl && (clean === '当前字符' || clean === 'Current key')) {
                    currentKeyEl = sp.nextElementSibling;
                }
            }
            const keys = [];
            const unlocked = [];
            const locked = [];
            const forced = [];
            if (keySetEl) {
                for (const el of Array.from(keySetEl.querySelectorAll('span[data-code-point]'))) {
                    const cp = parseInt(el.getAttribute('data-code-point') || '0', 10);
                    const ch = String.fromCodePoint(cp);
                    const isLocked = el.querySelector('svg') !== null;
                    const cs = window.getComputedStyle(el);
                    const td = (cs.textDecorationLine || cs.textDecoration || '').toLowerCase();
                    const isForced = td.includes('underline');
                    keys.push({
                        codePoint: cp,
                        char: ch,
                        label: (el.textContent || '').trim(),
                        locked: isLocked,
                        unlocked: !isLocked,
                        forced: isForced,
                        bg: cs.backgroundColor,
                    });
                    if (isLocked) locked.push(ch);
                    else unlocked.push(ch);
                    if (isForced) forced.push(ch);
                }
            }
            let focusedChar = null;
            let currentKeyText = '';
            if (currentKeyEl) {
                currentKeyText = (currentKeyEl.textContent || '').trim();
                const curSpan = currentKeyEl.querySelector('span[data-code-point]');
                if (curSpan) {
                    const cp = parseInt(curSpan.getAttribute('data-code-point') || '0', 10);
                    focusedChar = String.fromCodePoint(cp);
                }
            }
            return {
                keys,
                unlocked,
                locked,
                forced,
                focusedChar,
                currentKeyText,
            };
        }"""
    )


def read_target_speed_setting(page: Page) -> dict[str, Any]:
    """Read TargetSpeedProp label, bounds, CPM value, and formatted display text in Settings fieldset 1."""
    row = page.locator('main fieldset:nth-of-type(1) > div:has(input[type="range"][max="750"])').first
    row.wait_for(state="visible", timeout=10000)
    return row.evaluate(
        """(el) => {
            const labelEl = el.querySelector(':scope > span:nth-of-type(1)');
            const slider = el.querySelector('input[type="range"]');
            const spans = Array.from(el.querySelectorAll(':scope > span'));
            const lastSpan = spans[spans.length - 1];
            return {
                label: labelEl ? (labelEl.textContent || '').trim() : '',
                min: slider ? parseInt(slider.min || '0', 10) : 0,
                max: slider ? parseInt(slider.max || '0', 10) : 0,
                valueCpm: slider ? parseInt(slider.value || '0', 10) : 0,
                displayText: lastSpan ? (lastSpan.textContent || '').trim() : '',
            };
        }"""
    )


def set_target_speed_setting(page: Page, cpm: int) -> None:
    """Set TargetSpeedProp range slider to exact CPM value in Settings fieldset 1."""
    slider = page.locator('main fieldset:nth-of-type(1) input[type="range"][max="750"]').first
    slider.wait_for(state="visible", timeout=10000)
    slider.fill(str(int(cpm)))
    expect(slider).to_have_value(str(int(cpm)), timeout=5000)


def has_keytrace_mode_setting(page: Page) -> bool:
    """Return True if KeytraceModeProp ('练习模式：' / 'Practice mode:') is rendered in Settings fieldset 1."""
    row = page.locator("main fieldset:nth-of-type(1) > div").filter(
        has_text=re.compile(r"练习模式|Practice mode")
    )
    return row.count() > 0


def select_keytrace_mode_setting(page: Page, mode: str) -> None:
    """Select KeytraceModeProp ('auto' | 'keytrace' | 'standalone') in Settings fieldset 1."""
    patterns = {
        "auto": r"自动检测|Auto detect",
        "keytrace": r"KeyTrace 联动全解锁|KeyTrace linked",
        "standalone": r"独立网页课程|Standalone web course",
    }
    if mode not in patterns:
        raise ValueError(f"Unsupported keytrace mode {mode!r}; expected one of {tuple(patterns)}")
    row = page.locator("main fieldset:nth-of-type(1) > div").filter(
        has_text=re.compile(r"练习模式|Practice mode")
    ).first
    row.wait_for(state="visible", timeout=10000)
    opt = row.locator('span[tabindex="0"]').first
    opt.click()
    page.locator('ul[role="menu"]').wait_for(state="visible", timeout=5000)
    page.locator('ul[role="menu"] li[role="menuitem"]').filter(
        has_text=re.compile(patterns[mode])
    ).first.click()


def read_en_cursor_error_state(page: Page) -> dict[str, Any]:
    """Read EN cursor error count, red miss tint, caret error attribute, and consecutive error badge."""
    return page.evaluate(
        """() => {
            const ltrLines = Array.from(document.querySelectorAll('main div[dir="ltr"]'));
            const container = ltrLines.length > 0 ? ltrLines[0].parentElement : document.querySelector('main');
            const errChar = container ? container.querySelector('[data-error-count]') : null;
            const badges = container ? Array.from(container.querySelectorAll('[data-error-badge="1"]')) : [];
            const caretErr = container ? container.querySelector('[data-cursor-error="1"]') : null;
            const cs = errChar ? window.getComputedStyle(errChar) : null;
            return {
                errorCount: errChar ? parseInt(errChar.getAttribute('data-error-count') || '0', 10) : 0,
                badgeCount: badges.length,
                badgeText: badges.length > 0 ? (badges[0].textContent || '').trim() : null,
                cursorError: caretErr !== null,
                cursorColorStyle: errChar ? (errChar.style.color || '') : '',
                cursorComputedColor: cs ? cs.color : null,
            };
        }"""
    )


def install_toast_recorder(page: Page) -> None:
    """Install a MutationObserver on <Toaster /> (main > div:last-child) to record every rendered toast message."""
    page.evaluate(
        """() => {
            if (window.__e2eToastObserver) {
                try { window.__e2eToastObserver.disconnect(); } catch {}
            }
            window.__e2eToasts = [];
            const seen = new WeakSet();
            const captureNode = (node) => {
                if (!(node instanceof HTMLElement)) return;
                if (seen.has(node)) return;
                seen.add(node);
                const msgEl = node.children.length >= 2 ? node.children[1] : node;
                const txt = (msgEl.textContent || '').trim();
                if (txt) {
                    window.__e2eToasts.push(txt);
                }
            };
            const toaster = document.querySelector('main > div:last-child');
            if (!toaster) return;
            for (const ch of Array.from(toaster.children)) {
                captureNode(ch);
            }
            const obs = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    for (const n of Array.from(m.addedNodes)) {
                        captureNode(n);
                    }
                }
            });
            obs.observe(toaster, { childList: true });
            window.__e2eToastObserver = obs;
        }"""
    )


def read_recorded_toasts(page: Page) -> list[str]:
    return page.evaluate("() => Array.isArray(window.__e2eToasts) ? [...window.__e2eToasts] : []")


def wait_for_recorded_toast(
    page: Page,
    patterns: list[str],
    timeout_ms: int = 8000,
) -> list[str]:
    deadline = time.monotonic() + timeout_ms / 1000.0
    compiled = [re.compile(p) for p in patterns]
    while time.monotonic() < deadline:
        toasts = read_recorded_toasts(page)
        if any(r.search(t) for t in toasts for r in compiled):
            return toasts
        time.sleep(0.08)
    toasts = read_recorded_toasts(page)
    raise TimeoutError(f"Expected toast matching {patterns!r}, recorded={toasts!r}")


def count_keytrace_practice_chrome(page: Page) -> dict[str, int]:
    """Count internal KeyTrace nav links and practice pill elements currently in DOM."""
    return page.evaluate(
        """() => {
            const isKeytraceRoute = (href) => /^(\\/[a-z-]+)?\\/keytrace$/i.test(href || '');
            const navLinks = Array.from(document.querySelectorAll('nav a')).filter(a =>
                isKeytraceRoute(a.getAttribute('href'))
            ).length;
            const mainLinks = Array.from(document.querySelectorAll('main a')).filter(a => {
                const href = a.getAttribute('href') || '';
                const txt = (a.textContent || '').trim();
                return isKeytraceRoute(href) && (txt.includes('监控') || txt.includes('Monitor'));
            }).length;
            const pillTexts = Array.from(document.querySelectorAll('main section span')).filter(sp => {
                const txt = (sp.textContent || '').trim();
                return txt.includes('日常监控') || txt.startsWith('KeyTrace');
            }).length;
            return { navLinks, pillLinks: mainLinks, pillTexts };
        }"""
    )

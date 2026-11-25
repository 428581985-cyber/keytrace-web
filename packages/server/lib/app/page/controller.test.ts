import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Application } from "@fastr/core";
import { Cookie } from "@fastr/headers";
import { load } from "cheerio";
import { deepEqual, equal } from "rich-assert";
import { kMain } from "../module.ts";
import { TestContext } from "../test/context.ts";
import { startApp } from "../test/request.ts";

const context = new TestContext();

for (const path of [
  "/",
  "/account",
  "/help",
  "/high-scores",
  "/keytrace",
  "/layouts",
  "/multiplayer",
  "/profile",
  "/profile/example1",
  "/profile/example2",
  "/profile/example3",
  "/profile/example4",
  "/profile/example5",
  "/typing-test",
  "/terms-of-service",
  "/privacy-policy",
]) {
  test(`load page "${path}"`, async () => {
    // Arrange.

    const request = startApp(context.get(Application, kMain));

    // Act.

    const response = await request
      .GET(path)
      .header("X-Forwarded-Host", "www.keybr.com")
      .header("X-Forwarded-Proto", "https")
      .send();

    // Assert.

    equal(response.status, 200);
    equal(response.headers.get("Content-Type"), "text/html; charset=UTF-8");

    const $ = load(await response.body.text());
    equal($("script#page-data").length, 1);
    equal($("#root").length, 1);
  });
}

test(`load custom theme from cookie`, async () => {
  // Arrange.

  const request = startApp(context.get(Application, kMain));

  // Act.

  const response = await request
    .GET("/")
    .header("X-Forwarded-Host", "www.keybr.com")
    .header("X-Forwarded-Proto", "https")
    .header(
      "Cookie",
      new Cookie([["prefs", '{"color":"dark","font":"spectral"}']]),
    )
    .send();

  // Assert.

  equal(response.status, 200);
  equal(response.headers.get("Content-Type"), "text/html; charset=UTF-8");
  deepEqual(response.headers.getAll("Set-Cookie"), []);

  const $ = load(await response.body.text());
  equal($("html").attr("data-color"), "dark");
  equal($("html").attr("data-font"), "spectral");
});

test(`ignore invalid theme cookie`, async () => {
  // Arrange.

  const request = startApp(context.get(Application, kMain));

  // Act.

  const response = await request
    .GET("/")
    .header("X-Forwarded-Host", "www.keybr.com")
    .header("X-Forwarded-Proto", "https")
    .header("Cookie", new Cookie([["prefs", "%%%garbage%%%"]]))
    .send();

  // Assert.

  equal(response.status, 200);
  equal(response.headers.get("Content-Type"), "text/html; charset=UTF-8");
  deepEqual(response.headers.getAll("Set-Cookie"), []);

  const $ = load(await response.body.text());
  equal($("html").attr("data-color"), "system");
  equal($("html").attr("data-font"), "open-sans");
});

function extractPageData(html: string): Record<string, unknown> {
  const $ = load(html);
  const script = $("script#page-data").text();
  const match = script.match(/var __PAGE_DATA__ = (.+);$/);
  if (match == null) {
    throw new Error(`Missing __PAGE_DATA__ script: ${script}`);
  }
  return JSON.parse(match[1]) as Record<string, unknown>;
}

test("populates keytraceAvailable in SSR pageData according to events dir and KEYTRACE_ENABLED", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keytrace-page-"));
  const prevDir = process.env.KEYTRACE_EVENTS_DIR;
  const prevEnabled = process.env.KEYTRACE_ENABLED;
  const request = startApp(context.get(Application, kMain));

  try {
    // 1. Empty directory in auto mode -> keytraceAvailable: false.
    delete process.env.KEYTRACE_ENABLED;
    process.env.KEYTRACE_EVENTS_DIR = dir;
    const resEmpty = await request
      .GET("/")
      .header("X-Forwarded-Host", "www.keybr.com")
      .header("X-Forwarded-Proto", "https")
      .send();
    equal(resEmpty.status, 200);
    equal(extractPageData(await resEmpty.body.text()).keytraceAvailable, false);

    // 2. Directory with a valid day event file -> keytraceAvailable: true.
    await writeFile(join(dir, "2026-11-24.jsonl"), "\n", "utf8");
    const resAvail = await request
      .GET("/")
      .header("X-Forwarded-Host", "www.keybr.com")
      .header("X-Forwarded-Proto", "https")
      .send();
    equal(resAvail.status, 200);
    equal(extractPageData(await resAvail.body.text()).keytraceAvailable, true);

    // 3. KEYTRACE_ENABLED=false overrides existing files -> keytraceAvailable: false.
    process.env.KEYTRACE_ENABLED = "false";
    const resDisabled = await request
      .GET("/")
      .header("X-Forwarded-Host", "www.keybr.com")
      .header("X-Forwarded-Proto", "https")
      .send();
    equal(resDisabled.status, 200);
    equal(
      extractPageData(await resDisabled.body.text()).keytraceAvailable,
      false,
    );
  } finally {
    if (prevDir === undefined) {
      delete process.env.KEYTRACE_EVENTS_DIR;
    } else {
      process.env.KEYTRACE_EVENTS_DIR = prevDir;
    }
    if (prevEnabled === undefined) {
      delete process.env.KEYTRACE_ENABLED;
    } else {
      process.env.KEYTRACE_ENABLED = prevEnabled;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { lessonProps } from "@keybr/lesson";
import { type PageData, PageDataContext } from "@keybr/pages-shared";
import { FakeSettingsContext, Settings } from "@keybr/settings";
import { render } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router";
import { equal, isNotNull, isNull } from "rich-assert";
import { NavMenu } from "./NavMenu.tsx";

const pageData: PageData = {
  base: "https://www.keybr.com/",
  locale: "zh-hans",
  user: null,
  publicUser: {
    id: null,
    name: "Anonymous",
    imageUrl: null,
  },
  settings: null,
  keytraceAvailable: true,
};

test("render default zh-hans locale when KeyTrace is available", () => {
  const prevFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({ status: { available: true, active: true } }),
    } as unknown as Response;
  };

  const r = render(
    <PageDataContext.Provider value={pageData}>
      <FakeSettingsContext>
        <FakeIntlProvider>
          <MemoryRouter>
            <NavMenu currentPath="/page" />
          </MemoryRouter>
        </FakeIntlProvider>
      </FakeSettingsContext>
    </PageDataContext.Provider>,
  );

  try {
    isNotNull(r.queryByText("Practice"));
    isNotNull(r.queryByText("Profile"));
    isNotNull(r.queryByText("键盘监控"));
    isNotNull(r.queryByText("Help"));
    isNotNull(r.queryByText("English"));
    equal(fetchCalls, 1);

    const githubLink = r.getByRole("link", { name: "GitHub" });
    equal(
      githubLink.getAttribute("href"),
      "https://github.com/428581985-cyber/keytrace",
    );
    equal(githubLink.getAttribute("target"), "_blank");
    equal(githubLink.getAttribute("rel"), "noopener noreferrer");
  } finally {
    r.unmount();
    globalThis.fetch = prevFetch;
  }
});

test("render en locale when KeyTrace is available", () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({ status: { available: true, active: false } }),
    }) as unknown as Response;

  const r = render(
    <PageDataContext.Provider value={{ ...pageData, locale: "en" }}>
      <FakeSettingsContext>
        <IntlProvider locale="en" defaultLocale="en" timeZone="UTC">
          <MemoryRouter>
            <NavMenu currentPath="/page" />
          </MemoryRouter>
        </IntlProvider>
      </FakeSettingsContext>
    </PageDataContext.Provider>,
  );

  try {
    isNotNull(r.queryByText("Practice"));
    isNotNull(r.queryByText("Profile"));
    isNotNull(r.queryByText("KeyTrace Monitor"));
    isNotNull(r.queryByText("Help"));
    isNotNull(r.queryByText("简体中文"));

    const githubLink = r.getByRole("link", { name: "GitHub" });
    equal(
      githubLink.getAttribute("href"),
      "https://github.com/428581985-cyber/keytrace",
    );
    equal(githubLink.getAttribute("target"), "_blank");
    equal(githubLink.getAttribute("rel"), "noopener noreferrer");
  } finally {
    r.unmount();
    globalThis.fetch = prevFetch;
  }
});

test("hides KeyTrace link and skips polling when keytraceAvailable is false", () => {
  const prevFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("should not fetch when keytrace is unavailable");
  };

  const r = render(
    <PageDataContext.Provider value={{ ...pageData, keytraceAvailable: false }}>
      <FakeSettingsContext>
        <FakeIntlProvider>
          <MemoryRouter>
            <NavMenu currentPath="/page" />
          </MemoryRouter>
        </FakeIntlProvider>
      </FakeSettingsContext>
    </PageDataContext.Provider>,
  );

  try {
    isNotNull(r.queryByText("Practice"));
    isNotNull(r.queryByText("Profile"));
    isNull(r.queryByText("键盘监控"));
    isNull(r.queryByText("KeyTrace Monitor"));
    equal(fetchCalls, 0);
  } finally {
    r.unmount();
    globalThis.fetch = prevFetch;
  }
});

test("hides KeyTrace link and skips polling in standalone mode even when keytraceAvailable is true", () => {
  const prevFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("should not fetch in standalone mode");
  };

  const settings = new Settings().set(lessonProps.keytraceMode, "standalone");

  const r = render(
    <PageDataContext.Provider value={{ ...pageData, keytraceAvailable: true }}>
      <FakeSettingsContext initialSettings={settings}>
        <FakeIntlProvider>
          <MemoryRouter>
            <NavMenu currentPath="/page" />
          </MemoryRouter>
        </FakeIntlProvider>
      </FakeSettingsContext>
    </PageDataContext.Provider>,
  );

  try {
    isNotNull(r.queryByText("Practice"));
    isNull(r.queryByText("键盘监控"));
    isNull(r.queryByText("KeyTrace Monitor"));
    equal(fetchCalls, 0);
  } finally {
    r.unmount();
    globalThis.fetch = prevFetch;
  }
});

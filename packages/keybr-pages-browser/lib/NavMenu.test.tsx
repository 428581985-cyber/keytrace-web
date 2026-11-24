import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { PageDataContext } from "@keybr/pages-shared";
import { render } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router";
import { equal, isNotNull } from "rich-assert";
import { NavMenu } from "./NavMenu.tsx";

const pageData = {
  base: "https://www.keybr.com/",
  locale: "zh-hans",
  user: null,
  publicUser: {
    id: null,
    name: "Anonymous",
    imageUrl: null,
  },
  settings: null,
};

test("render default zh-hans locale", () => {
  const r = render(
    <PageDataContext.Provider value={pageData}>
      <FakeIntlProvider>
        <MemoryRouter>
          <NavMenu currentPath="/page" />
        </MemoryRouter>
      </FakeIntlProvider>
    </PageDataContext.Provider>,
  );

  try {
    isNotNull(r.queryByText("Practice"));
    isNotNull(r.queryByText("Profile"));
    isNotNull(r.queryByText("键盘监控"));
    isNotNull(r.queryByText("Help"));
    isNotNull(r.queryByText("English"));

    const githubLink = r.getByRole("link", { name: "GitHub" });
    equal(
      githubLink.getAttribute("href"),
      "https://github.com/428581985-cyber/keytrace",
    );
    equal(githubLink.getAttribute("target"), "_blank");
    equal(githubLink.getAttribute("rel"), "noopener noreferrer");
  } finally {
    r.unmount();
  }
});

test("render en locale", () => {
  const r = render(
    <PageDataContext.Provider value={{ ...pageData, locale: "en" }}>
      <IntlProvider locale="en" defaultLocale="en" timeZone="UTC">
        <MemoryRouter>
          <NavMenu currentPath="/page" />
        </MemoryRouter>
      </IntlProvider>
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
  }
});

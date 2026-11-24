import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { ThemePrefs } from "@keybr/themes";
import { render } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { equal, isNull } from "rich-assert";
import { ThemeProvider } from "./ThemeProvider.tsx";
import { ThemeSwitcher } from "./ThemeSwitcher.tsx";

const originalMatchMedia = window.matchMedia;

function mockMatchMedia(matches: boolean) {
  window.matchMedia = (query) => {
    return new (class extends EventTarget {
      matches = matches;
      media = query;
    })() as MediaQueryList;
  };
}

function setPrefsCookie(color: string, font = "open-sans") {
  const prefs = new ThemePrefs({ color, font });
  document.cookie = `${ThemePrefs.cookieKey}=${encodeURIComponent(ThemePrefs.serialize(prefs))}`;
  document.documentElement.dataset["color"] = prefs.color;
  document.documentElement.dataset["font"] = prefs.font;
}

test.beforeEach(() => {
  mockMatchMedia(false);
  setPrefsCookie("system", "open-sans");
});

test.afterEach(() => {
  window.matchMedia = originalMatchMedia;
  document.cookie = `${ThemePrefs.cookieKey}=; max-age=0`;
  document.documentElement.dataset["color"] = "";
  document.documentElement.dataset["font"] = "";
});

test("renders two buttons without font button or menu popover", async () => {
  const r = render(
    <FakeIntlProvider>
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    </FakeIntlProvider>,
  );

  try {
    equal(r.getAllByRole("button").length, 2);
    isNull(r.queryByRole("menu"));

    await userEvent.click(r.getByTitle("Switch to dark theme."));

    equal(r.getAllByRole("button").length, 2);
    isNull(r.queryByRole("menu"));
  } finally {
    r.unmount();
  }
});

test("toggles directly between dark and light from system when OS is light", async () => {
  mockMatchMedia(false);
  setPrefsCookie("system");

  const r = render(
    <FakeIntlProvider>
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    </FakeIntlProvider>,
  );

  try {
    await userEvent.click(r.getByTitle("Switch to dark theme."));
    equal(document.documentElement.dataset["color"], "dark");
    equal(
      document.cookie.includes(
        encodeURIComponent(
          ThemePrefs.serialize(
            new ThemePrefs({ color: "dark", font: "open-sans" }),
          ),
        ),
      ),
      true,
    );

    await userEvent.click(r.getByTitle("Switch to light theme."));
    equal(document.documentElement.dataset["color"], "light");

    await userEvent.click(r.getByTitle("Switch to dark theme."));
    equal(document.documentElement.dataset["color"], "dark");
  } finally {
    r.unmount();
  }
});

test("toggles directly to light from system when OS is dark", async () => {
  mockMatchMedia(true);
  setPrefsCookie("system");

  const r = render(
    <FakeIntlProvider>
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    </FakeIntlProvider>,
  );

  try {
    await userEvent.click(r.getByTitle("Switch to light theme."));
    equal(document.documentElement.dataset["color"], "light");

    await userEvent.click(r.getByTitle("Switch to dark theme."));
    equal(document.documentElement.dataset["color"], "dark");
  } finally {
    r.unmount();
  }
});

test("normalizes legacy presets and preserves data-font across toggles", async () => {
  setPrefsCookie("gray", "spectral");

  const r1 = render(
    <FakeIntlProvider>
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    </FakeIntlProvider>,
  );

  try {
    await userEvent.click(r1.getByTitle("Switch to dark theme."));
    equal(document.documentElement.dataset["color"], "dark");
    equal(document.documentElement.dataset["font"], "spectral");
    equal(
      document.cookie.includes(
        encodeURIComponent(
          ThemePrefs.serialize(
            new ThemePrefs({ color: "dark", font: "spectral" }),
          ),
        ),
      ),
      true,
    );
  } finally {
    r1.unmount();
  }

  setPrefsCookie("chocolate", "spectral");

  const r2 = render(
    <FakeIntlProvider>
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    </FakeIntlProvider>,
  );

  try {
    await userEvent.click(r2.getByTitle("Switch to light theme."));
    equal(document.documentElement.dataset["color"], "light");
    equal(document.documentElement.dataset["font"], "spectral");
    equal(
      document.cookie.includes(
        encodeURIComponent(
          ThemePrefs.serialize(
            new ThemePrefs({ color: "light", font: "spectral" }),
          ),
        ),
      ),
      true,
    );
  } finally {
    r2.unmount();
  }
});

test("renders safely when window.matchMedia is undefined", () => {
  window.matchMedia = undefined as unknown as typeof window.matchMedia;

  const r = render(
    <FakeIntlProvider>
      <ThemeSwitcher />
    </FakeIntlProvider>,
  );

  try {
    equal(r.getAllByRole("button").length, 2);
  } finally {
    r.unmount();
  }
});

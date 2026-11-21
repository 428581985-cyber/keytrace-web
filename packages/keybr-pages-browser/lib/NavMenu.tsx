import { type PageInfo, Pages } from "@keybr/pages-shared";
import { Icon } from "@keybr/widget";
import { mdiTranslate } from "@mdi/js";
import { clsx } from "clsx";
import { type ReactNode, useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { NavLink } from "react-router";
import * as styles from "./NavMenu.module.less";
import { ThemeSwitcher } from "./themes/ThemeSwitcher.tsx";

// 本地双语版：保留练习页、个人统计、键盘监控、帮助、主题切换，以及中/英双语切换入口。
export function NavMenu({ currentPath }: { readonly currentPath: string }) {
  return (
    <div className={styles.root}>
      <MenuItem>
        <ThemeSwitcher />
      </MenuItem>

      <MenuItem>
        <MenuItemLink page={Pages.practice} />
      </MenuItem>

      <MenuItem>
        <MenuItemLink page={Pages.profile} />
      </MenuItem>

      <MenuItem>
        <MenuItemLink page={Pages.keytrace} badge={<KeyTraceStatusDot />} />
      </MenuItem>

      <MenuItem>
        <MenuItemLink page={Pages.help} />
      </MenuItem>

      <MenuItem>
        <LanguageToggle currentPath={currentPath} />
      </MenuItem>
    </div>
  );
}

function KeyTraceStatusDot(): ReactNode {
  const [active, setActive] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/_/keytrace/summary?days=1", {
          cache: "no-store",
        });
        if (!res.ok) {
          return;
        }
        const json = (await res.json()) as {
          readonly status?: { readonly active?: boolean };
        };
        if (alive) {
          setActive(Boolean(json.status?.active));
        }
      } catch {
        // Ignore offline/test errors.
      }
    };
    void check();
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void check();
      }
    }, 30000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  if (active == null) {
    return null;
  }

  return (
    <span
      style={{
        display: "inline-block",
        inlineSize: "6px",
        blockSize: "6px",
        borderRadius: "999px",
        marginInlineStart: "6px",
        verticalAlign: "middle",
        backgroundColor: active
          ? "var(--LessonKey--hit__color, #7fae8f)"
          : "var(--Name-color, #888)",
      }}
    />
  );
}

function MenuItem({ children }: { readonly children: ReactNode }) {
  return <div className={styles.item}>{children}</div>;
}

function LanguageToggle({ currentPath }: { readonly currentPath: string }) {
  const { locale } = useIntl();
  const targetLocale = locale === "en" ? "zh-hans" : "en";
  const label = targetLocale === "en" ? "English" : "简体中文";
  return (
    <a className={styles.link} href={Pages.intlPath(currentPath, targetLocale)}>
      <Icon className={styles.icon} shape={mdiTranslate} />
      <span className={styles.label}>{label}</span>
    </a>
  );
}

function MenuItemLink({
  page: {
    path,
    link: { label, title, icon },
  },
  badge,
}: {
  readonly page: PageInfo;
  readonly badge?: ReactNode;
}) {
  const { formatMessage, locale } = useIntl();
  const isZh = locale.startsWith("zh");
  const displayLabel =
    path === Pages.keytrace.path && isZh ? "键盘监控" : formatMessage(label);
  const displayTitle =
    path === Pages.keytrace.path && isZh
      ? "查看本地 KeyTrace 日常打字监控详情与弱键分析。"
      : title && formatMessage(title);
  return (
    <NavLink
      className={({ isActive }) =>
        clsx(styles.link, isActive && styles.isActive)
      }
      to={path}
      title={displayTitle}
    >
      <Icon className={styles.icon} shape={icon ?? ""} />
      <span className={styles.label}>
        {displayLabel}
        {badge}
      </span>
    </NavLink>
  );
}

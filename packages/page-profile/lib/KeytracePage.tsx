import {
  isZhLanguage,
  KeyboardOptions,
  keyboardProps,
  Layout,
  resolveZhScheme,
  setZhScheme,
  switchPracticeLanguage,
  useFormattedNames,
} from "@keybr/keyboard";
import { getZhFocusStorageKeys } from "@keybr/lesson";
import { useFormatter } from "@keybr/lesson-ui";
import { Pages, Screen } from "@keybr/pages-shared";
import { useResults } from "@keybr/result";
import { syncKeyTraceResults } from "@keybr/result-loader";
import { useSettings } from "@keybr/settings";
import {
  Button,
  FieldSet,
  Figure,
  formatDuration,
  Header,
  Icon,
  Para,
} from "@keybr/widget";
import { mdiKeyboardOutline, mdiRefresh, mdiSync } from "@mdi/js";
import { clsx } from "clsx";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useIntl } from "react-intl";
import * as styles from "./KeytracePage.module.less";

type KeyTraceSummaryBucket = {
  readonly totalKeys: number;
  readonly zhKeys: number;
  readonly enKeys: number;
  readonly hits: number;
  readonly errors: number;
  readonly corrections: number;
  readonly accuracy: number;
  readonly avgWpm: number;
  readonly activeMs: number;
  readonly commits: number;
};

type KeyTraceDailyEntry = {
  readonly day: string;
  readonly zhKeys: number;
  readonly enKeys: number;
  readonly totalKeys: number;
  readonly errors: number;
  readonly accuracy: number;
  readonly avgWpm: number;
  readonly activeMs: number;
};

type KeyTraceAppEntry = {
  readonly exe: string;
  readonly totalKeys: number;
  readonly zhKeys: number;
  readonly enKeys: number;
  readonly errors: number;
  readonly accuracy: number;
  readonly avgWpm: number;
  readonly lastTs: number;
};

type KeyTraceWeakKey = {
  readonly letter: string;
  readonly codePoint: number;
  readonly hits: number;
  readonly misses: number;
  readonly errorRate: number;
  readonly medianIkiMs: number;
  readonly wpm: number;
  readonly samples: number;
};

type KeyTraceLayoutId =
  | "zh-sp"
  | "zh-sp-zrm"
  | "zh-sp-ms"
  | "zh-sp-sg"
  | "zh-qp"
  | "en-us";

type ZhKeyTraceLayoutId = Exclude<KeyTraceLayoutId, "en-us">;
type WeakKeyLangTab = "zh" | "en";

const ZH_LAYOUT_IDS: readonly ZhKeyTraceLayoutId[] = [
  "zh-sp",
  "zh-sp-zrm",
  "zh-sp-ms",
  "zh-sp-sg",
  "zh-qp",
];

type KeyTraceCorrectionItem = {
  readonly ts: number;
  readonly exe: string;
  readonly layoutId: KeyTraceLayoutId;
  readonly wrongChar: string;
  readonly rightChar: string;
  readonly contextText: string;
};

type KeyTraceCommitItem = {
  readonly ts: number;
  readonly exe: string;
  readonly layoutId: KeyTraceLayoutId;
  readonly text: string;
  readonly keys: number;
};

type KeyTraceDashboardData = {
  readonly status: {
    readonly active: boolean;
    readonly lastEventTs: number | null;
    readonly todayDate: string;
    readonly todayBytes: number;
    readonly daysAvailable: number;
    readonly imeName: string | null;
  };
  readonly today: KeyTraceSummaryBucket;
  readonly overall: KeyTraceSummaryBucket;
  readonly daily: readonly KeyTraceDailyEntry[];
  readonly apps: readonly KeyTraceAppEntry[];
  readonly weakKeys: {
    readonly "zh-sp": readonly KeyTraceWeakKey[];
    readonly "zh-sp-zrm": readonly KeyTraceWeakKey[];
    readonly "zh-sp-ms": readonly KeyTraceWeakKey[];
    readonly "zh-sp-sg": readonly KeyTraceWeakKey[];
    readonly "zh-qp": readonly KeyTraceWeakKey[];
    readonly "en-us": readonly KeyTraceWeakKey[];
  };
  readonly recentCorrections: readonly KeyTraceCorrectionItem[];
  readonly recentCommits: readonly KeyTraceCommitItem[];
};

function hasAnyZhWeakKeys(
  weakKeys: KeyTraceDashboardData["weakKeys"],
): boolean {
  return ZH_LAYOUT_IDS.some((id) => (weakKeys[id]?.length ?? 0) > 0);
}

function pickAutoKeyTab(
  current: WeakKeyLangTab,
  zhLayoutId: ZhKeyTraceLayoutId,
  dashboard: KeyTraceDashboardData,
): WeakKeyLangTab {
  const hasCurrent =
    current === "zh"
      ? (dashboard.weakKeys[zhLayoutId]?.length ?? 0) > 0 ||
        hasAnyZhWeakKeys(dashboard.weakKeys)
      : (dashboard.weakKeys["en-us"]?.length ?? 0) > 0;
  if (hasCurrent) {
    return current;
  }
  const hasZh = hasAnyZhWeakKeys(dashboard.weakKeys);
  const hasEn = (dashboard.weakKeys["en-us"]?.length ?? 0) > 0;
  if (hasZh) {
    return "zh";
  }
  if (hasEn) {
    return "en";
  }
  return current;
}

function formatLayoutBadge(
  layoutId: KeyTraceLayoutId,
  isZhLocale: boolean,
): string {
  switch (layoutId) {
    case "zh-sp":
      return isZhLocale ? "双拼·小鹤" : "ZH-SP";
    case "zh-sp-zrm":
      return isZhLocale ? "双拼·自然码" : "ZH-ZRM";
    case "zh-sp-ms":
      return isZhLocale ? "双拼·微软" : "ZH-MS";
    case "zh-sp-sg":
      return isZhLocale ? "双拼·搜狗" : "ZH-SG";
    case "zh-qp":
      return isZhLocale ? "全拼" : "ZH-QP";
    case "en-us":
      return "EN";
  }
}

function formatClockTime(ts: number | null): string {
  if (ts == null) {
    return "—";
  }
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function requestKeyTraceSummary(): Promise<KeyTraceDashboardData> {
  const res = await fetch("/_/keytrace/summary?days=14", {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as KeyTraceDashboardData;
}

export function KeytracePage({
  onNavigateToPractice,
}: {
  readonly onNavigateToPractice?: () => void;
} = {}): ReactNode {
  const { locale } = useIntl();
  const isZhLocale = locale.startsWith("zh");
  const t = (zh: string, en: string) => (isZhLocale ? zh : en);

  const { settings, updateSettings } = useSettings();
  const { results, appendResults, replaceResults } = useResults();
  const { formatSpeed } = useFormatter();
  const { formatZhSchemeName } = useFormattedNames();
  const activeZhLayout = resolveZhScheme(settings);
  const activeZhLayoutId = (ZH_LAYOUT_IDS.includes(
    activeZhLayout.id as ZhKeyTraceLayoutId,
  )
    ? activeZhLayout.id
    : "zh-sp") as ZhKeyTraceLayoutId;

  const [data, setData] = useState<KeyTraceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [keyTab, setKeyTab] = useState<WeakKeyLangTab>(() =>
    isZhLanguage(settings.get(keyboardProps.language)) ? "zh" : "en",
  );
  const userSelectedTabRef = useRef(false);
  const activeZhLayoutIdRef = useRef(activeZhLayoutId);

  useEffect(() => {
    activeZhLayoutIdRef.current = activeZhLayoutId;
  }, [activeZhLayoutId]);

  const handleTabChange = useCallback((tab: WeakKeyLangTab) => {
    userSelectedTabRef.current = true;
    setKeyTab(tab);
  }, []);

  const refreshManual = useCallback(() => {
    setLoading(true);
    requestKeyTraceSummary()
      .then((json) => {
        setData(json);
        if (!userSelectedTabRef.current) {
          setKeyTab((prev) =>
            pickAutoKeyTab(prev, activeZhLayoutIdRef.current, json),
          );
        }
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = () => {
      requestKeyTraceSummary()
        .then((json) => {
          if (alive) {
            setData(json);
            if (!userSelectedTabRef.current) {
              setKeyTab((prev) =>
                pickAutoKeyTab(prev, activeZhLayoutIdRef.current, json),
              );
            }
            setError(null);
          }
        })
        .catch((err) => {
          if (alive) {
            setError(err instanceof Error ? err.message : String(err));
          }
        })
        .finally(() => {
          if (alive) {
            setLoading(false);
          }
        });
    };
    poll();
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        poll();
      }
    }, 30000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const handleSync = async () => {
    if (syncing) {
      return;
    }
    setSyncing(true);
    try {
      const { added } = await syncKeyTraceResults(
        results,
        appendResults,
        replaceResults,
      );
      setSyncMsg(
        added > 0
          ? t(`已同步 ${added} 条记录到练习统计`, `Synced ${added} records`)
          : t("练习统计已是最新", "Already up to date"),
      );
      const json = await requestKeyTraceSummary();
      setData(json);
      if (!userSelectedTabRef.current) {
        setKeyTab((prev) => pickAutoKeyTab(prev, activeZhLayoutId, json));
      }
      setError(null);
    } catch {
      setSyncMsg(t("同步失败", "Sync failed"));
    } finally {
      setSyncing(false);
    }
  };

  const handlePracticeKey = (letter: string, layoutId: KeyTraceLayoutId) => {
    const currentOptions = KeyboardOptions.from(settings);
    if (layoutId === "en-us") {
      if (currentOptions.layout.id !== "en-us") {
        updateSettings(switchPracticeLanguage(settings, "en"));
      }
    } else {
      const targetLayout = Layout.ALL.get(layoutId, activeZhLayout);
      let next = setZhScheme(settings, targetLayout);
      if (!isZhLanguage(KeyboardOptions.from(next).language)) {
        next = switchPracticeLanguage(next, "zh");
      }
      if (
        next !== settings &&
        (currentOptions.language.id !== targetLayout.language.id ||
          currentOptions.layout.id !== targetLayout.id)
      ) {
        updateSettings(next);
      }
      const { lockedKey, drillKey } = getZhFocusStorageKeys(targetLayout.id);
      try {
        window.localStorage.setItem(lockedKey, letter.toLowerCase());
        window.localStorage.setItem(drillKey, letter.toLowerCase());
      } catch {
        // Ignore storage errors.
      }
    }
    if (onNavigateToPractice != null) {
      onNavigateToPractice();
    } else if (typeof window !== "undefined") {
      window.location.assign(Pages.practice.path);
    }
  };

  return (
    <Screen>
      <Header level={1}>{t("键盘监控", "KeyTrace Monitor")}</Header>

      <Para>
        {t(
          "实时汇总本地 ~/.keytrace/events/ 的日常真实打字记录（纯本地读取、不上传云端）。停顿超过 3 秒不计入速度，退格纠正自动归因到最终正确按下的键。",
          "Summarizes real-world typing logs from ~/.keytrace/events/ locally. Pauses over 3s are discarded and backspace corrections are attributed to the final key.",
        )}
      </Para>

      <div className={styles.statusBar}>
        <div className={styles.statusInfo}>
          <span className={styles.statusBadge}>
            <span
              className={clsx(
                styles.dot,
                data?.status.active && styles.dotActive,
              )}
            />
            {data == null
              ? t("加载中…", "Loading…")
              : data.status.active
                ? t("录制活跃中", "Recording Active")
                : data.status.todayBytes > 0
                  ? t("今日已记录", "Recorded Today")
                  : t("今日暂无事件", "Idle Today")}
          </span>
          {data?.status.imeName && (
            <span className={styles.metaText}>
              {t("输入法:", "IME:")} {data.status.imeName}
            </span>
          )}
          <span className={styles.metaText}>
            {t("最近事件:", "Last event:")}{" "}
            {formatClockTime(data?.status.lastEventTs ?? null)}
          </span>
          {data != null && (
            <span className={styles.metaText}>
              {t("今日日志:", "Today log:")} {formatBytes(data.status.todayBytes)}
            </span>
          )}
          {syncMsg && <span className={styles.metaText}>{syncMsg}</span>}
        </div>
        <div className={styles.actions}>
          <Button
            disabled={loading}
            icon={<Icon shape={mdiRefresh} />}
            label={t("刷新", "Refresh")}
            onClick={refreshManual}
          />
          <Button
            disabled={syncing}
            icon={<Icon shape={mdiSync} />}
            label={t("同步到练习", "Sync to Practice")}
            onClick={() => {
              void handleSync();
            }}
          />
        </div>
      </div>

      {error && (
        <Para className={styles.emptyNote}>
          {t("加载监控数据失败：", "Failed to load monitor summary: ")}
          {error}
        </Para>
      )}

      {data && (
        <>
          <SummarySection
            title={t(
              `今日日常打字（${data.status.todayDate}）`,
              `Today (${data.status.todayDate})`,
            )}
            bucket={data.today}
            formatSpeed={formatSpeed}
            isZhLocale={isZhLocale}
          />

          <SummarySection
            title={t(
              `累计监控统计（共 ${data.status.daysAvailable} 天日志）`,
              `All-Time (${data.status.daysAvailable} days)`,
            )}
            bucket={data.overall}
            formatSpeed={formatSpeed}
            isZhLocale={isZhLocale}
          />

          <DailyChartSection daily={data.daily} isZhLocale={isZhLocale} />

          <WeakKeysSection
            weakKeys={data.weakKeys}
            keyTab={keyTab}
            activeZhLayoutId={activeZhLayoutId}
            activeZhSchemeName={formatZhSchemeName(activeZhLayout)}
            formatZhSchemeName={formatZhSchemeName}
            onTabChange={handleTabChange}
            onPractice={handlePracticeKey}
            isZhLocale={isZhLocale}
          />

          <AppsSection
            apps={data.apps}
            formatSpeed={formatSpeed}
            isZhLocale={isZhLocale}
          />

          <div className={styles.twoCols}>
            <div>
              <CorrectionsSection
                items={data.recentCorrections}
                isZhLocale={isZhLocale}
              />
            </div>
            <div>
              <CommitsSection
                items={data.recentCommits}
                isZhLocale={isZhLocale}
              />
            </div>
          </div>
        </>
      )}
    </Screen>
  );
}

function SummarySection({
  title,
  bucket,
  formatSpeed,
  isZhLocale,
}: {
  readonly title: string;
  readonly bucket: KeyTraceSummaryBucket;
  readonly formatSpeed: (cpm: number) => string;
  readonly isZhLocale: boolean;
}): ReactNode {
  const t = (zh: string, en: string) => (isZhLocale ? zh : en);
  const zhRatio =
    bucket.totalKeys > 0
      ? Math.round((bucket.zhKeys / bucket.totalKeys) * 100)
      : 0;
  return (
    <>
      <Header level={2}>{title}</Header>
      <Para className={styles.statisticList}>
        <span className={styles.statisticListItem}>
          <span className={styles.itemName}>
            {t("有效击键", "Keystrokes")}
          </span>
          <span className={styles.itemValue}>
            {bucket.totalKeys.toLocaleString()}
          </span>
          <span className={styles.itemSub}>
            {t("中文", "ZH")} {bucket.zhKeys} · {t("英文", "EN")}{" "}
            {bucket.enKeys} ({zhRatio}%)
          </span>
        </span>
        <span className={styles.statisticListItem}>
          <span className={styles.itemName}>{t("平均速度", "Avg Speed")}</span>
          <span className={styles.itemValue}>
            {bucket.avgWpm > 0 ? formatSpeed(bucket.avgWpm * 5) : "—"}
          </span>
          <span className={styles.itemSub}>
            {t("活跃", "Active")} {formatDuration(bucket.activeMs)}
          </span>
        </span>
        <span className={styles.statisticListItem}>
          <span className={styles.itemName}>{t("准确率", "Accuracy")}</span>
          <span className={styles.itemValue}>
            {bucket.totalKeys > 0 ? formatPct(bucket.accuracy) : "—"}
          </span>
          <span className={styles.itemSub}>
            {t("上屏", "Commits")} {bucket.commits}
          </span>
        </span>
        <span className={styles.statisticListItem}>
          <span className={styles.itemName}>
            {t("退格纠错", "Corrections")}
          </span>
          <span className={styles.itemValue}>{bucket.corrections}</span>
          <span className={styles.itemSub}>
            {t("错击", "Misses")} {bucket.errors}
          </span>
        </span>
      </Para>
    </>
  );
}

function DailyChartSection({
  daily,
  isZhLocale,
}: {
  readonly daily: readonly KeyTraceDailyEntry[];
  readonly isZhLocale: boolean;
}): ReactNode {
  const t = (zh: string, en: string) => (isZhLocale ? zh : en);
  if (daily.length === 0) {
    return null;
  }
  const maxKeys = Math.max(1, ...daily.map((d) => d.totalKeys));
  const width = 760;
  const height = 170;
  const padBottom = 26;
  const padTop = 14;
  const chartHeight = height - padBottom - padTop;
  const slotW = width / Math.max(1, daily.length);
  const barW = Math.min(36, Math.max(10, slotW * 0.56));

  return (
    <Figure legend={t("每日日常击键量（近 14 天）", "Daily Keystrokes (14d)")}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.chartSvg}
        role="img"
      >
        {daily.map((d, idx) => {
          const x = idx * slotW + (slotW - barW) / 2;
          const totalH = (d.totalKeys / maxKeys) * chartHeight;
          const zhH =
            d.totalKeys > 0 ? (d.zhKeys / d.totalKeys) * totalH : 0;
          const enH = totalH - zhH;
          const zhY = padTop + chartHeight - zhH;
          const enY = zhY - enH;
          const label = d.day.slice(5);
          return (
            <g key={d.day}>
              <title>
                {`${d.day}\n${t("总击键", "Total")}: ${d.totalKeys} (${t("中文", "ZH")} ${d.zhKeys} / ${t("英文", "EN")} ${d.enKeys})\nWPM: ${d.avgWpm} · ${t("准确率", "Acc")}: ${formatPct(d.accuracy)}`}
              </title>
              {enH > 0 && (
                <rect
                  x={x}
                  y={enY}
                  width={barW}
                  height={enH}
                  fill="var(--Value-color, #9f9999)"
                  opacity={0.7}
                />
              )}
              {zhH > 0 && (
                <rect
                  x={x}
                  y={zhY}
                  width={barW}
                  height={zhH}
                  fill="var(--LessonKey--hit__color, #7fae8f)"
                />
              )}
              <text
                x={x + barW / 2}
                y={height - 8}
                textAnchor="middle"
                fill="var(--Name-color, #888)"
                fontSize="12"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={styles.legendRow}>
        <span className={styles.legendItem}>
          <span
            className={styles.swatch}
            style={{ backgroundColor: "var(--LessonKey--hit__color, #7fae8f)" }}
          />
          {t("中文", "Chinese")}
        </span>
        <span className={styles.legendItem}>
          <span
            className={styles.swatch}
            style={{
              backgroundColor: "var(--Value-color, #9f9999)",
              opacity: 0.7,
            }}
          />
          {t("英文", "English")}
        </span>
      </div>
    </Figure>
  );
}

function WeakKeysSection({
  weakKeys,
  keyTab,
  activeZhLayoutId,
  activeZhSchemeName,
  formatZhSchemeName,
  onTabChange,
  onPractice,
  isZhLocale,
}: {
  readonly weakKeys: KeyTraceDashboardData["weakKeys"];
  readonly keyTab: WeakKeyLangTab;
  readonly activeZhLayoutId: ZhKeyTraceLayoutId;
  readonly activeZhSchemeName: string;
  readonly formatZhSchemeName: (layout: Layout) => string;
  readonly onTabChange: (tab: WeakKeyLangTab) => void;
  readonly onPractice: (letter: string, layoutId: KeyTraceLayoutId) => void;
  readonly isZhLocale: boolean;
}): ReactNode {
  const t = (zh: string, en: string) => (isZhLocale ? zh : en);
  const activeLayoutId: KeyTraceLayoutId =
    keyTab === "en" ? "en-us" : activeZhLayoutId;
  const list = (weakKeys[activeLayoutId] ?? []).slice(0, 12);
  const fallbackZhEntry =
    keyTab === "zh" && list.length === 0
      ? ZH_LAYOUT_IDS.map((id) => ({
          id,
          name: formatZhSchemeName(Layout.ALL.get(id)),
          count: weakKeys[id]?.length ?? 0,
        })).find((entry) => entry.count > 0) ?? null
      : null;

  return (
    <FieldSet
      legend={t(
        "日常最容易错 / 最慢的键（Top 12）",
        "Weakest & Slowest Keys in Daily Typing",
      )}
    >
      <div className={styles.tabRow}>
        <button
          type="button"
          className={clsx(
            styles.tabButton,
            keyTab === "zh" && styles.tabButtonActive,
          )}
          onClick={() => onTabChange("zh")}
        >
          {t("中文", "Chinese")}
        </button>
        <button
          type="button"
          className={clsx(
            styles.tabButton,
            keyTab === "en" && styles.tabButtonActive,
          )}
          onClick={() => onTabChange("en")}
        >
          {t("英文", "English")}
        </button>
        {keyTab === "zh" && (
          <span className={styles.schemeHint}>
            {t(
              `当前方案：${activeZhSchemeName}`,
              `Scheme: ${activeZhSchemeName}`,
            )}
          </span>
        )}
      </div>

      {list.length === 0 ? (
        <Para className={styles.emptyNote}>
          {fallbackZhEntry != null
            ? t(
                `当前方案（${activeZhSchemeName}）暂无足够键位样本；日志中检测到「${fallbackZhEntry.name}」有 ${fallbackZhEntry.count} 个键位样本（可在设置 → 键盘中切换方案）。`,
                `No samples for ${activeZhSchemeName} yet; found ${fallbackZhEntry.count} keys logged under ${fallbackZhEntry.name} (switch scheme in Settings).`,
              )
            : t("当前语言暂无足够键位样本。", "No key samples yet.")}
        </Para>
      ) : (
        <div className={styles.keyGrid}>
          {list.map((k) => {
            const highErr = k.errorRate >= 0.08 || k.medianIkiMs >= 320;
            return (
              <div key={k.codePoint} className={styles.keyCard}>
                <div className={styles.keyCardTop}>
                  <span
                    className={clsx(
                      styles.keyTile,
                      highErr ? styles.keyTileSlow : styles.keyTileWarn,
                    )}
                  >
                    {k.letter}
                  </span>
                  <div className={styles.keyPrimary}>
                    <span className={styles.keyErrRate}>
                      {t("错率", "Err")} {formatPct(k.errorRate)}
                    </span>
                    <span className={styles.keyHits}>
                      {k.misses} / {k.hits} {t("键", "keys")}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.drillButton}
                    title={t(
                      `跳转到练习页专注练习 ${k.letter} 键`,
                      `Practice key ${k.letter}`,
                    )}
                    onClick={() => onPractice(k.letter, activeLayoutId)}
                  >
                    <Icon shape={mdiKeyboardOutline} />
                    <span>{t("去练习", "Drill")}</span>
                  </button>
                </div>
                <div className={styles.keyCardBottom}>
                  <span>
                    {t("中位", "Median")} {k.medianIkiMs} ms
                  </span>
                  <span>
                    {t("等效", "Speed")} {k.wpm} wpm
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </FieldSet>
  );
}

function AppsSection({
  apps,
  formatSpeed,
  isZhLocale,
}: {
  readonly apps: readonly KeyTraceAppEntry[];
  readonly formatSpeed: (cpm: number) => string;
  readonly isZhLocale: boolean;
}): ReactNode {
  const t = (zh: string, en: string) => (isZhLocale ? zh : en);
  return (
    <FieldSet legend={t("分应用打字分布", "Typing by Application")}>
      {apps.length === 0 ? (
        <Para className={styles.emptyNote}>
          {t("暂无应用打字记录。", "No application data yet.")}
        </Para>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("应用", "Application")}</th>
                <th>{t("总击键", "Keys")}</th>
                <th>{t("中文 / 英文", "ZH / EN")}</th>
                <th>{t("速度", "Speed")}</th>
                <th>{t("准确率", "Accuracy")}</th>
                <th>{t("最近活跃", "Last Active")}</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.exe}>
                  <td className={styles.mono}>{app.exe}</td>
                  <td className={styles.mono}>
                    {app.totalKeys.toLocaleString()}
                  </td>
                  <td className={styles.mono}>
                    {app.zhKeys} / {app.enKeys}
                  </td>
                  <td className={styles.mono}>
                    {app.avgWpm > 0 ? formatSpeed(app.avgWpm * 5) : "—"}
                  </td>
                  <td className={styles.mono}>{formatPct(app.accuracy)}</td>
                  <td className={styles.mono}>{formatClockTime(app.lastTs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FieldSet>
  );
}

function CorrectionsSection({
  items,
  isZhLocale,
}: {
  readonly items: readonly KeyTraceCorrectionItem[];
  readonly isZhLocale: boolean;
}): ReactNode {
  const t = (zh: string, en: string) => (isZhLocale ? zh : en);
  return (
    <FieldSet
      legend={t("最近真实纠错还原", "Recent Real-World Corrections")}
    >
      {items.length === 0 ? (
        <Para className={styles.emptyNote}>
          {t("暂无纠错样本。", "No correction samples yet.")}
        </Para>
      ) : (
        <div className={styles.feedList}>
          {items.map((item, idx) => (
            <div key={`${item.ts}-${idx}`} className={styles.feedItem}>
              <div className={styles.feedHeader}>
                <span>
                  {formatClockTime(item.ts)} · {item.exe}
                </span>
                <span>{formatLayoutBadge(item.layoutId, isZhLocale)}</span>
              </div>
              <div>
                {t("误按", "Typed")}{" "}
                <span className={styles.wrongKey}>{item.wrongChar}</span> →{" "}
                {t("退格改按", "corrected to")}{" "}
                <span className={styles.rightKey}>{item.rightChar}</span>
                {" · "}
                <span className={styles.metaText}>「{item.contextText}」</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </FieldSet>
  );
}

function CommitsSection({
  items,
  isZhLocale,
}: {
  readonly items: readonly KeyTraceCommitItem[];
  readonly isZhLocale: boolean;
}): ReactNode {
  const t = (zh: string, en: string) => (isZhLocale ? zh : en);
  return (
    <FieldSet legend={t("最近录到的输入片段", "Recent Captured Commits")}>
      {items.length === 0 ? (
        <Para className={styles.emptyNote}>
          {t("暂无输入片段。", "No captured commits yet.")}
        </Para>
      ) : (
        <div className={styles.feedList}>
          {items.map((item, idx) => (
            <div key={`${item.ts}-${idx}`} className={styles.feedItem}>
              <div className={styles.feedHeader}>
                <span>
                  {formatClockTime(item.ts)} · {item.exe}
                </span>
                <span>
                  {formatLayoutBadge(item.layoutId, isZhLocale)} ·{" "}
                  {item.keys} {t("键", "keys")}
                </span>
              </div>
              <div>{item.text}</div>
            </div>
          ))}
        </div>
      )}
    </FieldSet>
  );
}

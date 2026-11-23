import {
  isZhLanguage,
  KeyboardOptions,
  Layout,
  useKeyboard,
} from "@keybr/keyboard";
import { type NamedUser, Screen, usePageData } from "@keybr/pages-shared";
import {
  activeDayCount,
  DailyStatsMap,
  type KeyStatsMap,
  makeKeyStatsMap,
  makeSummaryStats,
  selectChartSeries,
  totalCharacters,
} from "@keybr/result";
import { Settings } from "@keybr/settings";
import { ExplainerBoundary } from "@keybr/widget";
import { AccuracyStreaksSection } from "./profile/AccuracyStreaksSection.tsx";
import { CalendarSection } from "./profile/CalendarSection.tsx";
import { DataScript } from "./profile/DataScript.tsx";
import { ExplainProfile } from "./profile/ExplainProfile.tsx";
import { FooterSection } from "./profile/FooterSection.tsx";
import { HistogramsSection } from "./profile/HistogramsSection.tsx";
import { KeyFrequencyHeatmapSection } from "./profile/KeyFrequencyHeatmapSection.tsx";
import { KeyFrequencyHistogramSection } from "./profile/KeyFrequencyHistogramSection.tsx";
import { KeySpeedChartSection } from "./profile/KeySpeedChartSection.tsx";
import { KeySpeedHistogramSection } from "./profile/KeySpeedHistogramSection.tsx";
import { KeyTraceSyncBar } from "./profile/KeyTraceSyncBar.tsx";
import { MasterySection } from "./profile/MasterySection.tsx";
import { ProgressOverviewSection } from "./profile/ProgressOverviewSection.tsx";
import { ResultGrouper } from "./profile/ResultGrouper.tsx";
import { ShareProfileLink } from "./profile/ShareProfileLink.tsx";
import { SpeedChartSection } from "./profile/SpeedChartSection.tsx";
import { AllTimeSummary, TodaySummary } from "./profile/Summary.tsx";

if (typeof window !== "undefined") {
  const layout = Layout.findLayout(window.navigator.language);
  if (layout != null) {
    Settings.addDefaults(
      KeyboardOptions.default()
        .withLanguage(layout.language)
        .withLayout(layout)
        .save(new Settings()),
    );
  }
}

export function ProfilePage() {
  return (
    <Screen>
      <ExplainerBoundary>
        <ExplainProfile />
        <ResultGrouper>
          {(keyStatsMap) => <Content keyStatsMap={keyStatsMap} />}
        </ResultGrouper>
      </ExplainerBoundary>
    </Screen>
  );
}

function Content({ keyStatsMap }: { keyStatsMap: KeyStatsMap }) {
  const { publicUser } = usePageData();
  const keyboard = useKeyboard();
  const isZh = isZhLanguage(keyboard.layout.language);
  const { results } = keyStatsMap;
  const stats = makeSummaryStats(results);
  const dailyStatsMap = new DailyStatsMap(results);
  const chartSeries = selectChartSeries(results);
  const chartKeyStatsMap =
    chartSeries.mode === "date"
      ? makeKeyStatsMap(keyStatsMap.letters, chartSeries.results)
      : keyStatsMap;
  const activeDays = activeDayCount(results);
  const totalChars = totalCharacters(results);
  const todayChars = totalCharacters(dailyStatsMap.today.results);

  return (
    <>
      <DataScript stats={stats} dailyStatsMap={dailyStatsMap} />

      <KeyTraceSyncBar />

      <AllTimeSummary
        stats={stats}
        activeDays={activeDays}
        characters={totalChars}
      />

      <TodaySummary stats={dailyStatsMap.today.stats} characters={todayChars} />

      <AccuracyStreaksSection
        results={chartSeries.results}
        unit={chartSeries.mode === "date" ? "days" : "sessions"}
      />

      {!isZh && <HistogramsSection stats={stats} />}

      <ProgressOverviewSection keyStatsMap={chartKeyStatsMap} />

      {/* 每个键的掌握深度，独立一块，比逐键点开看速度图直观 */}
      <MasterySection keyStatsMap={keyStatsMap} />

      <SpeedChartSection
        results={chartSeries.results}
        showComplexity={!isZh}
      />

      <KeySpeedChartSection keyStatsMap={chartKeyStatsMap} />

      <KeySpeedHistogramSection keyStatsMap={keyStatsMap} />

      <KeyFrequencyHistogramSection keyStatsMap={keyStatsMap} />

      <KeyFrequencyHeatmapSection keyStatsMap={keyStatsMap} />

      <CalendarSection dailyStatsMap={dailyStatsMap} />

      {publicUser.id != null && (
        <ShareProfileLink user={publicUser as NamedUser} />
      )}

      <FooterSection />
    </>
  );
}

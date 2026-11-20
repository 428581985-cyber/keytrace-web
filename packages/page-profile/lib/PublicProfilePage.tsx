import { useKeyboard } from "@keybr/keyboard";
import { type NamedUser, Screen, UserName } from "@keybr/pages-shared";
import {
  activeDayCount,
  DailyStatsMap,
  type KeyStatsMap,
  makeKeyStatsMap,
  makeSummaryStats,
  selectChartSeries,
  totalCharacters,
} from "@keybr/result";
import { ExplainerBoundary, Header } from "@keybr/widget";
import { AccuracyStreaksSection } from "./profile/AccuracyStreaksSection.tsx";
import { CalendarSection } from "./profile/CalendarSection.tsx";
import { DataScript } from "./profile/DataScript.tsx";
import { ExplainProfile } from "./profile/ExplainProfile.tsx";
import { HistogramsSection } from "./profile/HistogramsSection.tsx";
import { KeyFrequencyHeatmapSection } from "./profile/KeyFrequencyHeatmapSection.tsx";
import { KeyFrequencyHistogramSection } from "./profile/KeyFrequencyHistogramSection.tsx";
import { KeySpeedChartSection } from "./profile/KeySpeedChartSection.tsx";
import { KeySpeedHistogramSection } from "./profile/KeySpeedHistogramSection.tsx";
import { ProgressOverviewSection } from "./profile/ProgressOverviewSection.tsx";
import { ResultGrouper } from "./profile/ResultGrouper.tsx";
import { SpeedChartSection } from "./profile/SpeedChartSection.tsx";
import { AllTimeSummary, TodaySummary } from "./profile/Summary.tsx";

export function PublicProfilePage({ user }: { user: NamedUser }) {
  return (
    <Screen>
      <ExplainerBoundary>
        <ExplainProfile />
        <Header level={1}>
          <UserName user={user} />
        </Header>
        <ResultGrouper>
          {(keyStatsMap) => <Content keyStatsMap={keyStatsMap} />}
        </ResultGrouper>
      </ExplainerBoundary>
    </Screen>
  );
}

function Content({ keyStatsMap }: { keyStatsMap: KeyStatsMap }) {
  const keyboard = useKeyboard();
  const isZh = keyboard.layout.language.id === "zh-sp";
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

      <SpeedChartSection
        results={chartSeries.results}
        showComplexity={!isZh}
      />

      <KeySpeedChartSection keyStatsMap={chartKeyStatsMap} />

      <KeySpeedHistogramSection keyStatsMap={keyStatsMap} />

      <KeyFrequencyHistogramSection keyStatsMap={keyStatsMap} />

      <KeyFrequencyHeatmapSection keyStatsMap={keyStatsMap} />

      <CalendarSection dailyStatsMap={dailyStatsMap} />
    </>
  );
}

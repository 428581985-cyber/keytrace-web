import { Screen } from "@keybr/pages-shared";
import { makeStats } from "@keybr/textinput";
import { useSoundPlayer } from "@keybr/textinput-sounds";
import { TextArea } from "@keybr/textinput-ui";
import { Box, type Focusable, Spacer, useView } from "@keybr/widget";
import { useRef, useState } from "react";
import {
  type TextGenerator,
  TextGeneratorLoader,
} from "../generators/index.ts";
import { Session, type TestResult } from "../session/index.ts";
import { type CompositeSettings, useCompositeSettings } from "../settings.ts";
import { views } from "../views.tsx";
import { LineTemplate } from "./LineTemplate.tsx";
import { TestProgress } from "./TestProgress.tsx";
import * as styles from "./TestScreen.module.less";
import { Toolbar } from "./Toolbar.tsx";

export function TestScreen() {
  return (
    <TextGeneratorLoader>
      {(generator) => (
        <Controller generator={generator} mark={generator.mark()} />
      )}
    </TextGeneratorLoader>
  );
}

function Controller({
  generator,
  mark,
}: {
  generator: TextGenerator;
  mark: unknown;
}) {
  const { setView } = useView(views);
  const settings = useCompositeSettings();
  const focusRef = useRef<Focusable>(null);
  const player = useSoundPlayer();
  const [state, setState] = useState(() => ({
    settings,
    generator,
    mark,
    ...createTestSession(settings, generator, mark),
  }));
  if (
    state.settings !== settings ||
    state.generator !== generator ||
    state.mark !== mark
  ) {
    setState({
      settings,
      generator,
      mark,
      ...createTestSession(settings, generator, mark),
    });
  }
  const { session, lines } = state;
  const [progress, setProgress] = useState(Session.emptyProgress);
  return (
    <Screen>
      <Toolbar
        onConfigure={() => {
          setView("settings");
        }}
        onChange={() => {
          focusRef.current?.focus();
        }}
      />
      <Spacer size={10} />
      <Box alignItems="center" justifyContent="center">
        <div className={styles.text}>
          <TextArea
            focusRef={focusRef}
            settings={settings.textDisplay}
            lines={lines}
            wrap={false}
            onFocus={() => {
              setState({
                settings,
                generator,
                mark,
                ...createTestSession(settings, generator, mark),
              });
            }}
            onKeyDown={session.handleKeyDown}
            onKeyUp={session.handleKeyUp}
            onInput={(event) => {
              const { feedback, progress, completed } =
                session.handleInput(event);
              setState((prev) => ({ ...prev, lines: session.getLines() }));
              setProgress(progress);
              player(feedback);
              if (completed) {
                setView("report", { result: makeResult(session) });
              }
            }}
            lineTemplate={LineTemplate}
          />
          <TestProgress progress={progress} />
        </div>
      </Box>
    </Screen>
  );
}

function createTestSession(
  settings: CompositeSettings,
  generator: TextGenerator,
  mark: unknown,
) {
  generator.reset(mark);
  const session = nextTest(settings, generator);
  return { session, lines: session.getLines() };
}

function nextTest(settings: CompositeSettings, generator: TextGenerator) {
  return new Session({ ...settings, numLines: 5, numCols: 55 }, generator);
}

function makeResult(session: Session): TestResult {
  const steps = session.getSteps();
  const events = session.getEvents();
  return {
    stats: makeStats(steps),
    steps,
    events,
  };
}

import { useIntlNumbers } from "@keybr/intl";
import { lessonProps } from "@keybr/lesson";
import { useSettings } from "@keybr/settings";
import {
  Description,
  Explainer,
  Field,
  FieldList,
  Range,
  Value,
} from "@keybr/widget";
import { type ReactNode } from "react";
import { FormattedMessage } from "react-intl";

// 中文双拼专用：成语浓度。
// 词表里四字成语是 8 个字母（每字两键），和普通词分成两池，按这个比例抽。
export function ZhProp(): ReactNode {
  const { formatPercents } = useIntlNumbers();
  const { settings, updateSettings } = useSettings();
  return (
    <>
      <FieldList>
        <Field>
          <FormattedMessage
            id="lesson.zh.idioms.label"
            defaultMessage="Idiom ratio:"
          />
        </Field>
        <Field>
          <Range
            size={16}
            min={0}
            max={100}
            step={1}
            value={Math.round(settings.get(lessonProps.idioms) * 100)}
            onChange={(value) => {
              updateSettings(settings.set(lessonProps.idioms, value / 100));
            }}
          />
        </Field>
        <Field>
          <Value value={formatPercents(settings.get(lessonProps.idioms))} />
        </Field>
      </FieldList>
      <Explainer>
        <Description>
          <FormattedMessage
            id="lesson.zh.idioms.description"
            defaultMessage="Ratio of four-character idioms in lesson text. Set to 0 for common words only; raise it for denser multi-character phrases."
          />
        </Description>
      </Explainer>
    </>
  );
}

import { Dir } from "@keybr/intl";
import { KeyboardOptions, Language } from "@keybr/keyboard";
import { getTargetSpeedProp, isZhTargetContext } from "@keybr/lesson";
import { useFormatter } from "@keybr/lesson-ui";
import { useSettings } from "@keybr/settings";
import {
  Description,
  Explainer,
  Field,
  FieldList,
  Icon,
  IconButton,
  Range,
  Value,
} from "@keybr/widget";
import { mdiSkipNext, mdiSkipPrevious } from "@mdi/js";
import { type ReactNode } from "react";
import { FormattedMessage } from "react-intl";

export function TargetSpeedProp(): ReactNode {
  const { formatSpeed } = useFormatter();
  const { settings, updateSettings } = useSettings();
  const isZh = isZhTargetContext(settings);
  const options = KeyboardOptions.from(settings);
  const prop = getTargetSpeedProp(settings);
  const targetSpeed = settings.get(prop);
  return (
    <>
      <FieldList>
        <Field>
          {isZh ? (
            <FormattedMessage
              id="settings.targetSpeed.zh.label"
              defaultMessage="Target typing speed (Chinese):"
            />
          ) : options.language === Language.EN ? (
            <FormattedMessage
              id="settings.targetSpeed.en.label"
              defaultMessage="Target typing speed (English):"
            />
          ) : (
            <FormattedMessage
              id="t_Target_typing_speed:"
              defaultMessage="Target typing speed:"
            />
          )}
        </Field>
        <Field>
          <Range
            size={16}
            min={prop.min}
            max={prop.max}
            step={1}
            value={targetSpeed}
            onChange={(value) => {
              updateSettings(settings.set(prop, value));
            }}
          />
        </Field>
        <Field>
          <Dir swap="icon">
            <IconButton
              icon={<Icon shape={mdiSkipPrevious} />}
              disabled={targetSpeed <= prop.min}
              onClick={() => {
                updateSettings(
                  settings.set(
                    prop,
                    Math.max(prop.min, Math.ceil(targetSpeed / 5) * 5 - 5),
                  ),
                );
              }}
            />
            <IconButton
              icon={<Icon shape={mdiSkipNext} />}
              disabled={targetSpeed >= prop.max}
              onClick={() => {
                updateSettings(
                  settings.set(
                    prop,
                    Math.min(prop.max, Math.floor(targetSpeed / 5) * 5 + 5),
                  ),
                );
              }}
            />
          </Dir>
        </Field>
        <Field>
          <Value value={formatSpeed(targetSpeed)} />
        </Field>
      </FieldList>
      <Explainer>
        <Description>
          <FormattedMessage
            id="settings.targetSpeed.description"
            defaultMessage="The target speed is used to measure the confidence level and the color of a letter. The closer to the target speed, the greener. In the guided mode a letter is only unlocked when you pass a target speed threshold. When you unlock all letters, you can increase the target speed to go back to the learning mode and unlock the letters again, this time with a higher speed threshold. We recommend to increase the target speed in modest steps only when you have all letters above the target speed."
          />
        </Description>
        <Description>
          <FormattedMessage
            id="settings.targetSpeed.separateHint"
            defaultMessage="Chinese and English target typing speeds are saved separately and switch automatically with the selected language."
          />
        </Description>
      </Explainer>
    </>
  );
}

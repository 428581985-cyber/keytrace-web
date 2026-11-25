import { type KeytraceMode, lessonProps } from "@keybr/lesson";
import { useSettings } from "@keybr/settings";
import {
  Description,
  Explainer,
  Field,
  FieldList,
  OptionList,
} from "@keybr/widget";
import { type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

export function KeytraceModeProp(): ReactNode {
  const { formatMessage } = useIntl();
  const { settings, updateSettings } = useSettings();
  const value = settings.get(lessonProps.keytraceMode);

  const options: { readonly value: KeytraceMode; readonly name: string }[] = [
    {
      value: "auto",
      name: formatMessage({
        id: "settings.keytraceMode.auto",
        defaultMessage: "Auto detect",
      }),
    },
    {
      value: "keytrace",
      name: formatMessage({
        id: "settings.keytraceMode.keytrace",
        defaultMessage: "KeyTrace linked (all keys unlocked)",
      }),
    },
    {
      value: "standalone",
      name: formatMessage({
        id: "settings.keytraceMode.standalone",
        defaultMessage: "Standalone web course (progressive unlock)",
      }),
    },
  ];

  return (
    <>
      <FieldList>
        <Field>
          <FormattedMessage
            id="settings.keytraceMode.label"
            defaultMessage="Practice mode:"
          />
        </Field>
        <Field>
          <OptionList
            options={options}
            value={value}
            onSelect={(next) => {
              updateSettings(
                settings.set(lessonProps.keytraceMode, next as KeytraceMode),
              );
            }}
          />
        </Field>
      </FieldList>
      <Explainer>
        <Description>
          <FormattedMessage
            id="settings.keytraceMode.description"
            defaultMessage="Choose whether practice unlocks all keys using local KeyTrace data or runs as a standalone progressive typing course. In standalone mode, KeyTrace records are isolated from practice progress without being deleted."
          />
        </Description>
      </Explainer>
    </>
  );
}

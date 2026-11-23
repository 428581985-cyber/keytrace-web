import {
  Geometry,
  isZhLanguage,
  isZhQuanpin,
  KeyboardOptions,
  keyboardProps,
  Language,
  useFormattedNames,
  useKeyboard,
  type ZhInputScheme,
  ZoneMod,
} from "@keybr/keyboard";
import { KeyLayer, PointersLayer, VirtualKeyboard } from "@keybr/keyboard-ui";
import { Tasks } from "@keybr/lang";
import { useSettings } from "@keybr/settings";
import { ModifierState, useDepressedKeys } from "@keybr/textinput-events";
import {
  CheckBox,
  Description,
  Explainer,
  Field,
  FieldList,
  FieldSet,
  OptionList,
} from "@keybr/widget";
import {
  memo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FormattedMessage, useIntl } from "react-intl";

export function KeyboardSettings(): ReactNode {
  const { formatMessage } = useIntl();
  return (
    <>
      <FieldSet
        legend={formatMessage({
          id: "t_Options",
          defaultMessage: "Options",
        })}
      >
        <LayoutProp />
      </FieldSet>
      <FieldSet
        legend={formatMessage({
          id: "t_Preview",
          defaultMessage: "Preview",
        })}
      >
        <KeyboardPreview />
        <GeometryProp />
      </FieldSet>
    </>
  );
}

function LayoutProp(): ReactNode {
  const { formatMessage } = useIntl();
  const { formatLanguageName } = useFormattedNames();
  const { settings, updateSettings } = useSettings();
  const options = KeyboardOptions.from(settings);
  const isZh = isZhLanguage(options.language);
  const lastZhSchemeRef = useRef<ZhInputScheme>(
    isZhQuanpin(options.language) ? "zh-qp" : "zh-sp",
  );

  useEffect(() => {
    if (isZh) {
      lastZhSchemeRef.current = isZhQuanpin(options.language)
        ? "zh-qp"
        : "zh-sp";
    }
  }, [isZh, options.language]);

  const languageOptions = [
    {
      value: "zh",
      name: formatMessage({
        id: "settings.keyboard.language.zh",
        defaultMessage: "Chinese",
      }),
    },
    {
      value: Language.EN.id,
      name: formatMessage({
        id: "settings.keyboard.language.en",
        defaultMessage: "English",
      }),
    },
  ];
  if (!isZh && options.language !== Language.EN) {
    languageOptions.push({
      value: options.language.id,
      name: formatLanguageName(options.language),
    });
  }

  const schemeOptions = [
    {
      value: Language.ZH_SP.id,
      name: formatMessage({
        id: "settings.keyboard.scheme.shuangpin",
        defaultMessage: "Xiaohe Shuangpin",
      }),
    },
    {
      value: Language.ZH_QP.id,
      name: formatMessage({
        id: "settings.keyboard.scheme.quanpin",
        defaultMessage: "Full Pinyin",
      }),
    },
  ];

  const selectLanguage = (language: Language) => {
    updateSettings(
      options
        .withLanguage(language)
        .withGeometry(options.geometry)
        .withZones(options.zones)
        .save(settings),
    );
  };

  return (
    <FieldList>
      <Field>
        <FormattedMessage id="t_Language:" defaultMessage="Language:" />
      </Field>
      <Field>
        <OptionList
          options={languageOptions}
          value={isZh ? "zh" : options.language.id}
          onSelect={(value) => {
            if (value === "zh") {
              selectLanguage(
                lastZhSchemeRef.current === "zh-qp"
                  ? Language.ZH_QP
                  : Language.ZH_SP,
              );
            } else {
              selectLanguage(Language.ALL.get(value));
            }
          }}
        />
      </Field>
      {isZh ? (
        <>
          <Field>
            <FormattedMessage
              id="settings.keyboard.scheme.label"
              defaultMessage="Input scheme:"
            />
          </Field>
          <Field>
            <OptionList
              options={schemeOptions}
              value={options.language.id}
              onSelect={(value) => {
                const nextScheme: ZhInputScheme =
                  value === Language.ZH_QP.id ? "zh-qp" : "zh-sp";
                lastZhSchemeRef.current = nextScheme;
                selectLanguage(
                  nextScheme === "zh-qp" ? Language.ZH_QP : Language.ZH_SP,
                );
              }}
            />
          </Field>
        </>
      ) : null}
    </FieldList>
  );
}

function GeometryProp(): ReactNode {
  const { formatMessage } = useIntl();
  const { settings, updateSettings } = useSettings();
  const options = KeyboardOptions.from(settings);
  return (
    <>
      <FieldList>
        <Field>
          <FormattedMessage id="t_Geometry:" defaultMessage="Geometry:" />
        </Field>
        <Field>
          <OptionList
            options={options.selectableGeometries().map((item) => ({
              value: item.id,
              name: item.name,
            }))}
            value={options.geometry.id}
            onSelect={(id) => {
              updateSettings(
                options
                  .withGeometry(Geometry.ALL.get(id))
                  .withZones(options.zones)
                  .save(settings),
              );
            }}
          />
        </Field>
        <Field>
          <FormattedMessage id="t_Zones:" defaultMessage="Zones:" />
        </Field>
        <Field>
          <OptionList
            options={options.selectableZones().map((item) => ({
              value: item.id,
              name: item.name,
            }))}
            value={options.zones.id}
            onSelect={(id) => {
              updateSettings(
                options.withZones(ZoneMod.ALL.get(id)).save(settings),
              );
            }}
          />
        </Field>
      </FieldList>
      <FieldList>
        <Field>
          <CheckBox
            label={formatMessage({
              id: "t_Colored_keys",
              defaultMessage: "Colored keys",
            })}
            checked={settings.get(keyboardProps.colors)}
            onChange={(value) => {
              updateSettings(settings.set(keyboardProps.colors, value));
            }}
          />
        </Field>
      </FieldList>
      <Explainer>
        <Description>
          <FormattedMessage
            id="settings.keyboardColors.description"
            defaultMessage="Show color coding of the keyboard zones. Use this option to learn which finger to use to press a key."
          />
        </Description>
      </Explainer>
      <FieldList>
        <Field>
          <CheckBox
            label={formatMessage({
              id: "t_Highlight_keys",
              defaultMessage: "Highlight keys",
            })}
            checked={settings.get(keyboardProps.pointers)}
            onChange={(value) => {
              updateSettings(settings.set(keyboardProps.pointers, value));
            }}
          />
        </Field>
      </FieldList>
      <Explainer>
        <Description>
          <FormattedMessage
            id="settings.keyboardPointers.description"
            defaultMessage="Highlight a key that must to be pressed next. Use this option to quickly find the position of a key if you don’t know the keyboard layout well."
          />
        </Description>
      </Explainer>
    </>
  );
}

const KeyboardPreview = memo(function KeyboardPreview(): ReactNode {
  const { settings } = useSettings();
  const keyboard = useKeyboard();
  const depressedKeys = useDepressedKeys(settings, keyboard);
  const colors = settings.get(keyboardProps.colors);
  const pointers = settings.get(keyboardProps.pointers);
  return (
    <VirtualKeyboard keyboard={keyboard} height="16rem">
      <KeyLayer
        depressedKeys={depressedKeys}
        toggledKeys={ModifierState.modifiers}
        showColors={colors}
      />
      {pointers && <PointersPreview key={keyboard.layout.id} />}
    </VirtualKeyboard>
  );
});

const PointersPreview = memo(function PointersPreview(): ReactNode {
  const keyboard = useKeyboard();
  const [index, setIndex] = useState(0);
  const suffix = useMemo(() => keyboard.getExampleLetters(), [keyboard]);
  useEffect(() => {
    const tasks = new Tasks();
    tasks.delayed(1000, () => {
      let newIndex = index + 1;
      if (newIndex >= suffix.length) {
        newIndex = 0;
      }
      setIndex(newIndex);
    });
    return () => {
      tasks.cancelAll();
    };
  }, [index, suffix]);
  return <PointersLayer suffix={suffix.slice(index)} delay={10} />;
});

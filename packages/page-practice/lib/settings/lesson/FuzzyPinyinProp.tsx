import { type ZhInputScheme } from "@keybr/keyboard";
import { type BooleanProp, useSettings } from "@keybr/settings";
import { textInputProps } from "@keybr/textinput";
import {
  CheckBox,
  Description,
  Explainer,
  Field,
  FieldList,
} from "@keybr/widget";
import { type ReactNode } from "react";
import { FormattedMessage } from "react-intl";
import * as styles from "./FuzzyPinyinProp.module.less";

type FuzzyOption = {
  readonly prop: BooleanProp;
  readonly label: string;
  readonly title?: string;
};

const SHUANGPIN_FINALS_OPTIONS: readonly FuzzyOption[] = [
  { prop: textInputProps.fuzzy.enEng, label: "en ↔ eng" },
  { prop: textInputProps.fuzzy.anAng, label: "an ↔ ang" },
  { prop: textInputProps.fuzzy.inIng, label: "in ↔ ing" },
  { prop: textInputProps.fuzzy.ianIang, label: "ian ↔ iang" },
];

const SHUANGPIN_INITIALS_OPTIONS: readonly FuzzyOption[] = [
  { prop: textInputProps.fuzzy.zhZ, label: "zh ↔ z" },
  { prop: textInputProps.fuzzy.chC, label: "ch ↔ c" },
  { prop: textInputProps.fuzzy.shS, label: "sh ↔ s" },
  { prop: textInputProps.fuzzy.lN, label: "l ↔ n" },
];

const QUANPIN_RETROFLEX_OPTIONS: readonly FuzzyOption[] = [
  { prop: textInputProps.fuzzy.zhZ, label: "zh ↔ z" },
  { prop: textInputProps.fuzzy.chC, label: "ch ↔ c" },
  { prop: textInputProps.fuzzy.shS, label: "sh ↔ s" },
];

const QUANPIN_NASALS_OPTIONS: readonly FuzzyOption[] = [
  { prop: textInputProps.fuzzy.anAng, label: "an ↔ ang" },
  { prop: textInputProps.fuzzy.enEng, label: "en ↔ eng" },
  { prop: textInputProps.fuzzy.inIng, label: "in ↔ ing" },
  { prop: textInputProps.fuzzy.ianIang, label: "ian ↔ iang" },
  { prop: textInputProps.fuzzy.uanUang, label: "uan ↔ uang" },
];

const QUANPIN_OTHER_OPTIONS: readonly FuzzyOption[] = [
  { prop: textInputProps.fuzzy.lN, label: "l ↔ n" },
  { prop: textInputProps.fuzzy.fH, label: "f ↔ h" },
  { prop: textInputProps.fuzzy.rL, label: "r ↔ l" },
  {
    prop: textInputProps.fuzzy.veUe,
    label: "lve ↔ lue",
    title: "lve ↔ lue, nve ↔ nue",
  },
];

function FuzzyOptionRow({
  label,
  options,
}: {
  readonly label?: ReactNode;
  readonly options: readonly FuzzyOption[];
}): ReactNode {
  const { settings, updateSettings } = useSettings();
  return (
    <FieldList>
      <Field size={10}>{label}</Field>
      {options.map(({ prop, label: optionLabel, title }) => (
        <Field key={prop.key}>
          <CheckBox
            label={optionLabel}
            title={title}
            checked={settings.get(prop)}
            onChange={(value) => {
              updateSettings(settings.set(prop, value));
            }}
          />
        </Field>
      ))}
    </FieldList>
  );
}

function QuanpinFuzzyGroupRow({
  label,
  groupLabel,
  options,
}: {
  readonly label?: ReactNode;
  readonly groupLabel: ReactNode;
  readonly options: readonly FuzzyOption[];
}): ReactNode {
  const { settings, updateSettings } = useSettings();
  return (
    <FieldList>
      <Field size={10}>{label}</Field>
      <div className={styles.groupRow}>
        <span className={styles.groupLabel}>{groupLabel}</span>
        <div className={styles.options}>
          {options.map(({ prop, label: optionLabel, title }) => (
            <CheckBox
              key={prop.key}
              label={optionLabel}
              title={title}
              checked={settings.get(prop)}
              onChange={(value) => {
                updateSettings(settings.set(prop, value));
              }}
            />
          ))}
        </div>
      </div>
    </FieldList>
  );
}

export function FuzzyPinyinProp({
  scheme = "zh-sp",
}: {
  readonly scheme?: ZhInputScheme;
}): ReactNode {
  if (scheme === "zh-qp") {
    return (
      <>
        <QuanpinFuzzyGroupRow
          label={
            <FormattedMessage
              id="lesson.zh.fuzzy.label"
              defaultMessage="Fuzzy pinyin:"
            />
          }
          groupLabel={
            <FormattedMessage
              id="lesson.zh.fuzzy.group.retroflex"
              defaultMessage="Retroflex"
            />
          }
          options={QUANPIN_RETROFLEX_OPTIONS}
        />
        <QuanpinFuzzyGroupRow
          groupLabel={
            <FormattedMessage
              id="lesson.zh.fuzzy.group.nasals"
              defaultMessage="Nasals"
            />
          }
          options={QUANPIN_NASALS_OPTIONS}
        />
        <QuanpinFuzzyGroupRow
          groupLabel={
            <FormattedMessage
              id="lesson.zh.fuzzy.group.other"
              defaultMessage="Other"
            />
          }
          options={QUANPIN_OTHER_OPTIONS}
        />
        <Explainer>
          <Description>
            <FormattedMessage
              id="lesson.zh.fuzzy.quanpin.description"
              defaultMessage="Accept fuzzy pinyin alternatives while practicing Chinese Full Pinyin (including lve/nve ↔ lue/nue) without counting them as errors."
            />
          </Description>
        </Explainer>
      </>
    );
  }

  return (
    <>
      <FuzzyOptionRow
        label={
          <FormattedMessage
            id="lesson.zh.fuzzy.label"
            defaultMessage="Fuzzy pinyin:"
          />
        }
        options={SHUANGPIN_FINALS_OPTIONS}
      />
      <FuzzyOptionRow options={SHUANGPIN_INITIALS_OPTIONS} />
      <Explainer>
        <Description>
          <FormattedMessage
            id="lesson.zh.fuzzy.description"
            defaultMessage="Accept fuzzy pinyin alternatives while practicing Chinese Shuangpin without counting them as errors."
          />
        </Description>
      </Explainer>
    </>
  );
}

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

type FuzzyOption = {
  readonly prop: BooleanProp;
  readonly label: string;
};

const FINALS_OPTIONS: readonly FuzzyOption[] = [
  { prop: textInputProps.fuzzy.enEng, label: "en ↔ eng" },
  { prop: textInputProps.fuzzy.anAng, label: "an ↔ ang" },
  { prop: textInputProps.fuzzy.inIng, label: "in ↔ ing" },
  { prop: textInputProps.fuzzy.ianIang, label: "ian ↔ iang" },
];

const INITIALS_OPTIONS: readonly FuzzyOption[] = [
  { prop: textInputProps.fuzzy.zhZ, label: "zh ↔ z" },
  { prop: textInputProps.fuzzy.chC, label: "ch ↔ c" },
  { prop: textInputProps.fuzzy.shS, label: "sh ↔ s" },
  { prop: textInputProps.fuzzy.lN, label: "l ↔ n" },
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
      {options.map(({ prop, label: optionLabel }) => (
        <Field key={prop.key}>
          <CheckBox
            label={optionLabel}
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

export function FuzzyPinyinProp(): ReactNode {
  return (
    <>
      <FuzzyOptionRow
        label={
          <FormattedMessage
            id="lesson.zh.fuzzy.label"
            defaultMessage="Fuzzy pinyin:"
          />
        }
        options={FINALS_OPTIONS}
      />
      <FuzzyOptionRow options={INITIALS_OPTIONS} />
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

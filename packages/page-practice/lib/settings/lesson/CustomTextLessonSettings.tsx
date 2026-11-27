import { useIntlNumbers } from "@keybr/intl";
import {
  getZhSchemeFromLayout,
  isZhLanguage,
  isZhQuanpin,
  type Language,
  type ZhSchemeId,
} from "@keybr/keyboard";
import {
  applyZhPolyphoneOverride,
  type CustomTextLesson,
  encodeZhSyllableForScheme,
  lessonProps,
  type ZhCustomAnalysis,
  type ZhPolyphoneOccurrence,
} from "@keybr/lesson";
import { useSettings } from "@keybr/settings";
import { textStatsOf } from "@keybr/unicode";
import {
  CheckBox,
  Description,
  Explainer,
  Field,
  FieldList,
  FieldSet,
  LinkButton,
  NameValue,
  Para,
  TextField,
} from "@keybr/widget";
import { clsx } from "clsx";
import {
  type ChangeEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import { FormattedMessage, useIntl } from "react-intl";
import * as styles from "./CustomTextLessonSettings.module.less";
import { exampleTexts, zhExampleTexts } from "./example-texts.ts";
import { FuzzyPinyinProp } from "./FuzzyPinyinProp.tsx";
import { LessonLengthProp } from "./LessonLengthProp.tsx";
import { TargetSpeedProp } from "./TargetSpeedProp.tsx";

const INITIAL_POLYPHONE_LIMIT = 24;

export function CustomTextLessonSettings({
  lesson,
}: {
  readonly lesson: CustomTextLesson;
}): ReactNode {
  const { formatMessage } = useIntl();
  const { settings } = useSettings();
  const { language } = lesson.model;
  const isZh = isZhLanguage(language);
  const zhScheme: ZhSchemeId =
    getZhSchemeFromLayout(lesson.keyboard.layout) ??
    (isZhQuanpin(language) ? "zh-qp" : "zh-sp");
  return (
    <>
      <Explainer>
        <Description>
          <FormattedMessage
            id="lessonType.customText.description"
            defaultMessage="Generate typing lessons from the words of your own custom text. All keys are included by default. This mode is for the pros."
          />
        </Description>
      </Explainer>

      <FieldSet
        legend={formatMessage({
          id: "t_Lesson_options",
          defaultMessage: "Practice options",
        })}
      >
        <CustomTextInput isZh={isZh} />
        {isZh ? (
          <ZhCustomTextStats analysis={lesson.zhAnalysis} />
        ) : (
          <CustomTextStats
            language={language}
            customText={settings.get(lessonProps.customText.content)}
          />
        )}
        {isZh && lesson.zhAnalysis != null && (
          <ZhPolyphoneReview analysis={lesson.zhAnalysis} scheme={zhScheme} />
        )}
        <CustomTextProcessing isZh={isZh} />
        {isZh && <FuzzyPinyinProp scheme={zhScheme} />}
        <TargetSpeedProp />
        <LessonLengthProp />
      </FieldSet>
    </>
  );
}

function CustomTextInput({ isZh }: { readonly isZh: boolean }): ReactNode {
  const { formatMessage } = useIntl();
  const { settings, updateSettings } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prop = isZh
    ? lessonProps.customText.zhContent
    : lessonProps.customText.content;
  const presets = isZh ? zhExampleTexts : exampleTexts;
  const currentValue = settings.get(prop);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file == null) {
      return;
    }
    try {
      const text =
        typeof file.text === "function"
          ? await file.text()
          : await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                resolve(typeof reader.result === "string" ? reader.result : "");
              };
              reader.onerror = () => {
                reject(reader.error ?? new Error("Failed to read file"));
              };
              reader.readAsText(file, "utf-8");
            });
      updateSettings(settings.set(prop, text.slice(0, prop.maxLength)));
    } finally {
      input.value = "";
    }
  };

  return (
    <>
      <Para className={styles.inputHeader}>
        <span>
          <FormattedMessage id="t_Examples:" defaultMessage="Examples:" />{" "}
          {presets.map(({ title, content }, index) => (
            <span key={index}>
              {index > 0 ? ", " : null}
              <LinkButton
                onClick={() => {
                  updateSettings(settings.set(prop, content));
                }}
              >
                {title}
              </LinkButton>
            </span>
          ))}
        </span>
        <span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            hidden={true}
            onChange={(event) => {
              void handleFileChange(event);
            }}
          />
          <LinkButton
            onClick={() => {
              fileInputRef.current?.click();
            }}
          >
            <FormattedMessage
              id="t_Import_txt"
              defaultMessage="Import TXT file"
            />
          </LinkButton>
        </span>
      </Para>
      <Para>
        <TextField
          type="textarea"
          placeholder={formatMessage({
            id: "t_Custom_text",
            defaultMessage: "Custom text",
          })}
          value={currentValue}
          onChange={(value) => {
            updateSettings(settings.set(prop, value));
          }}
        />
      </Para>
    </>
  );
}

function ZhCustomTextStats({
  analysis,
}: {
  readonly analysis: ZhCustomAnalysis | null;
}): ReactNode {
  const { formatMessage } = useIntl();
  const { formatNumber } = useIntlNumbers();
  const totalHanzi = analysis?.totalHanzi ?? 0;
  const wordCount = analysis?.wordCount ?? 0;
  const polyphoneCount = analysis?.polyphones.length ?? 0;
  const skippedCount = analysis?.skippedCount ?? 0;
  return (
    <FieldList>
      <Field>
        <NameValue
          name={formatMessage({
            id: "t_num_Zh_hanzi",
            defaultMessage: "Hanzi count",
          })}
          value={formatNumber(totalHanzi)}
        />
      </Field>
      <Field>
        <NameValue
          name={formatMessage({
            id: "t_num_Zh_words",
            defaultMessage: "Words",
          })}
          value={formatNumber(wordCount)}
        />
      </Field>
      <Field>
        <NameValue
          name={formatMessage({
            id: "t_num_Zh_polyphones",
            defaultMessage: "Polyphones",
          })}
          value={formatNumber(polyphoneCount)}
        />
      </Field>
      {skippedCount > 0 && (
        <Field>
          <NameValue
            name={formatMessage({
              id: "t_num_Zh_skipped",
              defaultMessage: "Skipped non-Chinese",
            })}
            value={formatNumber(skippedCount)}
          />
        </Field>
      )}
    </FieldList>
  );
}

function ZhPolyphoneReview({
  analysis,
  scheme,
}: {
  readonly analysis: ZhCustomAnalysis;
  readonly scheme: ZhSchemeId;
}): ReactNode {
  const { settings, updateSettings } = useSettings();
  const [expanded, setExpanded] = useState(false);

  if (analysis.polyphones.length === 0) {
    return null;
  }

  const visiblePolyphones = expanded
    ? analysis.polyphones
    : analysis.polyphones.slice(0, INITIAL_POLYPHONE_LIMIT);
  const hiddenCount = analysis.polyphones.length - visiblePolyphones.length;

  const handleCycleReading = (occ: ZhPolyphoneOccurrence) => {
    const idx = occ.readings.indexOf(occ.selected);
    const nextReading = occ.readings[(idx + 1) % occ.readings.length];
    if (nextReading == null || nextReading === occ.selected) {
      return;
    }
    const raw = settings.get(lessonProps.customText.zhContent);
    const updated = applyZhPolyphoneOverride(raw, occ, nextReading);
    updateSettings(settings.set(lessonProps.customText.zhContent, updated));
  };

  return (
    <div className={styles.polyphoneSection} data-polyphone-review="1">
      <div className={styles.polyphoneHint}>
        <FormattedMessage
          id="settings.zhPolyphoneReview.hint"
          defaultMessage="Polyphone review (click to cycle reading, or write char(pinyin) inline):"
        />
      </div>
      <div className={styles.polyphoneList}>
        {visiblePolyphones.map((occ) => {
          const schemeCode =
            scheme !== "zh-qp"
              ? encodeZhSyllableForScheme(occ.selected, scheme)
              : "";
          const readingLabel =
            schemeCode !== "" ? `${occ.selected}·${schemeCode}` : occ.selected;
          return (
            <button
              key={`${occ.rawIndex}:${occ.hanzi}`}
              type="button"
              data-polyphone-pill="1"
              data-hanzi={occ.hanzi}
              data-reading={occ.selected}
              data-pinned={occ.isPinned ? "1" : undefined}
              className={clsx(
                styles.polyphonePill,
                occ.isPinned && styles.polyphonePill_pinned,
              )}
              title={`${occ.contextBefore}${occ.hanzi}${occ.contextAfter}: ${occ.readings.join(" / ")}`}
              onClick={() => {
                handleCycleReading(occ);
              }}
            >
              {occ.contextBefore !== "" && (
                <span className={styles.polyphoneContext}>
                  {occ.contextBefore}
                </span>
              )}
              <span className={styles.polyphoneTarget}>{occ.hanzi}</span>
              <span className={styles.polyphoneReading}>[{readingLabel}]</span>
              {occ.contextAfter !== "" && (
                <span className={styles.polyphoneContext}>
                  {occ.contextAfter}
                </span>
              )}
            </button>
          );
        })}
        {analysis.polyphones.length > INITIAL_POLYPHONE_LIMIT && (
          <LinkButton
            className={styles.expandButton}
            onClick={() => {
              setExpanded((prev) => !prev);
            }}
          >
            {expanded ? (
              <FormattedMessage
                id="settings.zhPolyphoneReview.showLess"
                defaultMessage="Collapse"
              />
            ) : (
              <FormattedMessage
                id="settings.zhPolyphoneReview.showMore"
                defaultMessage="Show all {count}"
                values={{ count: hiddenCount + INITIAL_POLYPHONE_LIMIT }}
              />
            )}
          </LinkButton>
        )}
      </div>
    </div>
  );
}

function CustomTextStats({
  language,
  customText,
}: {
  readonly language: Language;
  readonly customText: string;
}): ReactNode {
  const { formatMessage } = useIntl();
  const { formatNumber } = useIntlNumbers();
  const { numWords, numUniqueWords, avgWordLength } = useMemo(
    () => textStatsOf(language.locale, customText),
    [language, customText],
  );
  return (
    <FieldList>
      <Field>
        <NameValue
          name={formatMessage({
            id: "t_num_All_words",
            defaultMessage: "All words",
          })}
          value={formatNumber(numWords)}
        />
      </Field>
      <Field>
        <NameValue
          name={formatMessage({
            id: "t_num_Unique_words",
            defaultMessage: "Unique words",
          })}
          value={formatNumber(numUniqueWords)}
        />
      </Field>
      <Field>
        <NameValue
          name={formatMessage({
            id: "t_Average_word_length",
            defaultMessage: "Average word length",
          })}
          value={formatNumber(avgWordLength, 2)}
        />
      </Field>
    </FieldList>
  );
}

function CustomTextProcessing({ isZh }: { readonly isZh: boolean }): ReactNode {
  const { formatMessage } = useIntl();
  const { settings, updateSettings } = useSettings();
  return (
    <FieldList>
      <Field>
        <CheckBox
          checked={settings.get(lessonProps.customText.lettersOnly)}
          label={formatMessage({
            id: "t_Remove_punctuation_characters",
            defaultMessage: "Remove punctuation characters",
          })}
          title={formatMessage({
            id: "settings.customTextLettersOnly.description",
            defaultMessage:
              "Remove punctuation from the text to make it simpler to type.",
          })}
          onChange={(value) => {
            updateSettings(
              settings.set(lessonProps.customText.lettersOnly, value),
            );
          }}
        />
      </Field>
      {!isZh && (
        <Field>
          <CheckBox
            checked={settings.get(lessonProps.customText.lowercase)}
            label={formatMessage({
              id: "t_Transform_to_lowercase",
              defaultMessage: "Transform to lowercase",
            })}
            title={formatMessage({
              id: "settings.customTextLowercase.description",
              defaultMessage:
                "Transform all text to lower case to make it simpler to type.",
            })}
            onChange={(value) => {
              updateSettings(
                settings.set(lessonProps.customText.lowercase, value),
              );
            }}
          />
        </Field>
      )}
      <Field>
        <CheckBox
          checked={settings.get(lessonProps.customText.randomize)}
          label={formatMessage({
            id: "t_Shuffle_words",
            defaultMessage: "Shuffle words",
          })}
          title={formatMessage({
            id: "settings.customTextRandomize.description",
            defaultMessage: "Put words from the custom text in a random order.",
          })}
          onChange={(value) => {
            updateSettings(
              settings.set(lessonProps.customText.randomize, value),
            );
          }}
        />
      </Field>
      {isZh && (
        <Field>
          <CheckBox
            checked={settings.get(lessonProps.customText.zhPolyphoneTolerance)}
            label={formatMessage({
              id: "t_Zh_polyphone_tolerance",
              defaultMessage: "Allow any valid polyphone reading",
            })}
            title={formatMessage({
              id: "settings.zhPolyphoneTolerance.description",
              defaultMessage:
                "Accept any valid phonetic reading of a polyphonic character during practice without counting it as an error.",
            })}
            onChange={(value) => {
              updateSettings(
                settings.set(
                  lessonProps.customText.zhPolyphoneTolerance,
                  value,
                ),
              );
            }}
          />
        </Field>
      )}
    </FieldList>
  );
}

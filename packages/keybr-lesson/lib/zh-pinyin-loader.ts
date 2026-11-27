import type * as PinyinPro from "pinyin-pro";

type PinyinProModule = Pick<typeof PinyinPro, "pinyin" | "polyphonic">;

let cachedModule: PinyinProModule | null = null;
let loadingPromise: Promise<PinyinProModule> | null = null;

export function getCachedPinyinProModule(): PinyinProModule | null {
  return cachedModule;
}

export function loadPinyinProModule(): Promise<PinyinProModule> {
  if (cachedModule != null) {
    return Promise.resolve(cachedModule);
  }
  if (loadingPromise == null) {
    loadingPromise = import(/* webpackChunkName: "zh-pinyin" */ "pinyin-pro")
      .then((mod) => {
        cachedModule = { pinyin: mod.pinyin, polyphonic: mod.polyphonic };
        return cachedModule;
      })
      .catch((err) => {
        loadingPromise = null;
        throw err;
      });
  }
  return loadingPromise;
}

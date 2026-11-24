import { type Language } from "@keybr/keyboard";
import {
  censor,
  makePhoneticModel,
  type PhoneticModel,
} from "@keybr/phonetic-model";
import { expectType, request } from "@keybr/request";
import { modelAssetPath } from "./assets.ts";

const cache = new Map<Language, Promise<PhoneticModel>>();

export const loaderImpl: PhoneticModel.Loader = (
  language: Language,
): Promise<PhoneticModel> => {
  const cached = cache.get(language);
  if (cached != null) {
    return cached;
  }
  const promise = (async () => {
    const response = await request
      .use(expectType("application/octet-stream"))
      .GET(modelAssetPath(language))
      .send();
    const body = await response.arrayBuffer();
    const model = makePhoneticModel(language, new Uint8Array(body));
    return censor(model);
  })().catch((err) => {
    cache.delete(language);
    throw err;
  });
  cache.set(language, promise);
  return promise;
};

import { createContext, type Ref, useContext } from "react";
import { type Anchor } from "../../floating/index.ts";

export const AnchorContext = createContext<Ref<Anchor | null>>(null);

export function useAnchor(anchor?: Ref<Anchor | null>): Ref<Anchor | null> {
  const contextAnchor = useContext(AnchorContext);
  return anchor ?? contextAnchor;
}

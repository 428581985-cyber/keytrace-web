import { KeytracePage } from "@keybr/page-profile";
import { Pages } from "@keybr/pages-shared";
import { ResultLoader } from "@keybr/result-loader";
import { useNavigate } from "react-router";

export default function Page() {
  const navigate = useNavigate();
  return (
    <ResultLoader>
      <KeytracePage
        onNavigateToPractice={() => {
          void navigate(Pages.practice.path);
        }}
      />
    </ResultLoader>
  );
}

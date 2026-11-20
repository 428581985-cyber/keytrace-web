import { useResults } from "@keybr/result";
import { syncKeyTraceResults } from "@keybr/result-loader";
import { Button, Field, FieldList, Icon } from "@keybr/widget";
import { mdiSync } from "@mdi/js";
import { type ReactNode, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

type SyncStatus =
  | { readonly type: "idle" }
  | { readonly type: "syncing" }
  | { readonly type: "synced"; readonly added: number }
  | { readonly type: "upToDate" }
  | { readonly type: "error" };

export function KeyTraceSyncBar(): ReactNode {
  const { formatMessage } = useIntl();
  const { results, appendResults } = useResults();
  const [status, setStatus] = useState<SyncStatus>({ type: "idle" });

  const handleSync = () => {
    if (status.type === "syncing") {
      return;
    }
    setStatus({ type: "syncing" });
    syncKeyTraceResults(results, appendResults)
      .then(({ added }) => {
        if (added > 0) {
          setStatus({ type: "synced", added });
        } else {
          setStatus({ type: "upToDate" });
        }
      })
      .catch(() => {
        setStatus({ type: "error" });
      });
  };

  return (
    <FieldList>
      <Field>
        <Button
          disabled={status.type === "syncing"}
          icon={<Icon shape={mdiSync} />}
          label={formatMessage({
            id: "profile.keytraceSync.button",
            defaultMessage: "Sync KeyTrace",
          })}
          title={formatMessage({
            id: "profile.keytraceSync.buttonDescription",
            defaultMessage:
              "Import new daily typing data from local KeyTrace event logs.",
          })}
          onClick={handleSync}
        />
      </Field>
      <Field>
        <SyncStatusText status={status} />
      </Field>
    </FieldList>
  );
}

function SyncStatusText({
  status,
}: {
  readonly status: SyncStatus;
}): ReactNode {
  switch (status.type) {
    case "idle":
      return (
        <FormattedMessage
          id="profile.keytraceSync.idle"
          defaultMessage="Ready to sync local KeyTrace logs."
        />
      );
    case "syncing":
      return (
        <FormattedMessage
          id="profile.keytraceSync.syncing"
          defaultMessage="Syncing KeyTrace logs…"
        />
      );
    case "synced":
      return (
        <FormattedMessage
          id="profile.keytraceSync.synced"
          defaultMessage="Synced {count, plural, one {# record} other {# records}}."
          values={{ count: status.added }}
        />
      );
    case "upToDate":
      return (
        <FormattedMessage
          id="profile.keytraceSync.upToDate"
          defaultMessage="KeyTrace logs are up to date."
        />
      );
    case "error":
      return (
        <FormattedMessage
          id="profile.keytraceSync.error"
          defaultMessage="Failed to sync KeyTrace logs."
        />
      );
  }
}

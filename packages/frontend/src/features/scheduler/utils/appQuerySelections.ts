import type {
    AppQuerySelection,
    DeliveryCaptureManifest,
} from '@lightdash/common';

type PickerRowBase = {
    captureKey: string;
    label: string;
    exploreName: string | null;
    excluded: boolean;
};

/**
 * One row of the delivery query picker: a fresh preview capture item merged
 * with the saved selection snapshot. `missing` rows are snapshot entries that
 * did not run in the preview — kept visible and toggleable.
 */
export type AppQueryPickerRow =
    | (PickerRowBase & {
          kind: 'ready';
          rowCount: number | null;
          limitReached: boolean;
          identityChanged: boolean;
      })
    | (PickerRowBase & {
          kind: 'error';
          error: string;
          identityChanged: boolean;
      })
    | (PickerRowBase & { kind: 'missing' });

/**
 * Merges a fresh preview manifest with the saved snapshot. Mirrors the
 * worker's `applyAppQuerySelections` matching rules: exact captureKey match
 * applies the saved excluded state; a label+explore match with a different
 * key means the query's identity changed — the stale exclusion is not
 * trusted (the row starts included) and the row carries an inline hint.
 */
export const buildAppQueryPickerRows = (
    manifest: DeliveryCaptureManifest,
    selections: AppQuerySelection[] | null,
): AppQueryPickerRow[] => {
    const orderedItems = [...manifest.items].sort((a, b) => a.order - b.order);
    if (selections === null) {
        return orderedItems.map((item) =>
            item.status === 'ready'
                ? {
                      kind: 'ready',
                      captureKey: item.captureKey,
                      label: item.label,
                      exploreName: item.exploreName,
                      excluded: false,
                      rowCount: item.rowCount,
                      limitReached: item.limitReached,
                      identityChanged: false,
                  }
                : {
                      kind: 'error',
                      captureKey: item.captureKey,
                      label: item.label,
                      exploreName: item.exploreName,
                      excluded: false,
                      error: item.error,
                      identityChanged: false,
                  },
        );
    }

    const byCaptureKey = new Map(selections.map((s) => [s.captureKey, s]));
    const resolvedCaptureKeys = new Set<string>();
    // Credit a stale entry's identity-changed hint to one row only, matching
    // the worker's one-notice-per-stale-entry dedup.
    const hintedStaleCaptureKeys = new Set<string>();

    const freshRows: AppQueryPickerRow[] = orderedItems.map((item) => {
        const exact = byCaptureKey.get(item.captureKey);
        let excluded = false;
        let identityChanged = false;
        if (exact) {
            resolvedCaptureKeys.add(exact.captureKey);
            excluded = exact.excluded;
        } else if (item.status === 'ready') {
            // The worker only fuzzy-matches ready items; error items have no
            // successful replacement to point at.
            const fuzzy = selections.find(
                (s) =>
                    s.label === item.label &&
                    s.exploreName === item.exploreName,
            );
            if (fuzzy) {
                resolvedCaptureKeys.add(fuzzy.captureKey);
                if (!hintedStaleCaptureKeys.has(fuzzy.captureKey)) {
                    hintedStaleCaptureKeys.add(fuzzy.captureKey);
                    identityChanged = true;
                }
            }
        }
        return item.status === 'ready'
            ? {
                  kind: 'ready',
                  captureKey: item.captureKey,
                  label: item.label,
                  exploreName: item.exploreName,
                  excluded,
                  rowCount: item.rowCount,
                  limitReached: item.limitReached,
                  identityChanged,
              }
            : {
                  kind: 'error',
                  captureKey: item.captureKey,
                  label: item.label,
                  exploreName: item.exploreName,
                  excluded,
                  error: item.error,
                  identityChanged,
              };
    });

    const missingRows: AppQueryPickerRow[] = selections
        .filter((s) => !resolvedCaptureKeys.has(s.captureKey))
        .map((s) => ({
            kind: 'missing',
            captureKey: s.captureKey,
            label: s.label,
            exploreName: s.exploreName,
            excluded: s.excluded,
        }));

    return [...freshRows, ...missingRows];
};

/** Full snapshot of every visible row — what the form persists once curated. */
export const toAppQuerySelections = (
    rows: AppQueryPickerRow[],
): AppQuerySelection[] =>
    rows.map(({ captureKey, label, exploreName, excluded }) => ({
        captureKey,
        label,
        exploreName,
        excluded,
    }));

export const hasExcludedQuerySelections = (
    selections: AppQuerySelection[] | null,
): boolean => selections !== null && selections.some((s) => s.excluded);

/** Client-side mirror of the server's empty-delivery rejection. */
export const areAllQuerySelectionsExcluded = (
    selections: AppQuerySelection[] | null,
): boolean =>
    selections !== null &&
    selections.length > 0 &&
    selections.every((s) => s.excluded);

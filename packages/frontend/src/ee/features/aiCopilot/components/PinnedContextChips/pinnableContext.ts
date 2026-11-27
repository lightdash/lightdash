import {
    assertUnreachable,
    type AiPromptContextInput,
    type AiPromptContextItem,
    type ChartKind,
} from '@lightdash/common';
import {
    type LauncherPendingContext,
    type LauncherPinnedContextEntry,
} from '../../store/aiAgentLauncherSlice';
import {
    getComposerChartContextItemLabel,
    getDataAppContextItemName,
    getPromptContextItemKey,
    getSqlChartContextItemLabel,
} from '../ChatElements/contentReferenceUtils';

const PINNABLE_TYPES = [
    'chart',
    'dashboard',
    'data_app',
    'document',
    'sql_chart',
    'composer_chart',
] as const;

/** Content a person can pin to a prompt, as opposed to files or references. */
export type PinnableContextItem = Extract<
    AiPromptContextItem,
    { type: (typeof PINNABLE_TYPES)[number] }
>;

export const isPinnableContextItem = (
    item: AiPromptContextItem,
): item is PinnableContextItem =>
    PINNABLE_TYPES.some((type) => type === item.type);

type PinnableContextMeta = {
    label: string;
    chartKind: ChartKind | null;
};

export const getPinnableContextMeta = (
    item: PinnableContextItem,
): PinnableContextMeta => {
    switch (item.type) {
        case 'chart':
            return {
                label: item.displayName ?? item.chartSlug ?? 'Chart',
                chartKind: item.chartKind,
            };
        case 'dashboard':
            return {
                label: item.displayName ?? item.dashboardSlug ?? 'Dashboard',
                chartKind: null,
            };
        case 'data_app':
            return {
                label: getDataAppContextItemName(item),
                chartKind: null,
            };
        case 'document':
            return {
                label: item.displayName ?? item.documentSlug ?? 'Document',
                chartKind: null,
            };
        case 'sql_chart':
            return {
                label: getSqlChartContextItemLabel(item),
                chartKind: null,
            };
        case 'composer_chart':
            return {
                label: getComposerChartContextItemLabel(item),
                chartKind: null,
            };
        default:
            return assertUnreachable(item, 'Unknown pinnable context item');
    }
};

const toEntry = (
    input: AiPromptContextInput[number],
    preview: AiPromptContextItem,
): LauncherPinnedContextEntry => ({
    key: getPromptContextItemKey(preview),
    input,
    preview,
});

/** Pairs what is sent with how it is shown; both lists describe the same content. */
export const toPinnedContextEntries = (
    inputs: AiPromptContextInput,
    previews: AiPromptContextItem[],
): LauncherPinnedContextEntry[] => {
    const previewsByKey = new Map(
        previews.map((preview) => [getPromptContextItemKey(preview), preview]),
    );
    return inputs.flatMap((input) => {
        const preview = previewsByKey.get(getPromptContextItemKey(input));
        return preview ? [toEntry(input, preview)] : [];
    });
};

/** The pinned content as link params, which hold one of each kind. */
export const pinnedEntriesToPendingContext = (
    entries: LauncherPinnedContextEntry[],
): LauncherPendingContext | null =>
    entries.length === 0
        ? null
        : entries.reduce<LauncherPendingContext>((refs, { input }) => {
              switch (input.type) {
                  case 'chart':
                      return { chartUuid: input.chartUuid, ...refs };
                  case 'dashboard':
                      return { dashboardUuid: input.dashboardUuid, ...refs };
                  case 'data_app':
                      return { dataAppUuid: input.appUuid, ...refs };
                  case 'document':
                      return { documentUuid: input.documentUuid, ...refs };
                  case 'sql_chart':
                      return { sqlChartUuid: input.sqlChartUuid, ...refs };
                  case 'composer_chart':
                      return {
                          composerChartUuid: input.composerChartUuid,
                          ...refs,
                      };
                  default:
                      return refs;
              }
          }, {});

import {
    type AppVersionStatusHistoryEntry,
    type AppVersionStatusHistoryEntryKind,
} from '@lightdash/common';

export type AppVersionNarrationData = {
    reasoning: string[];
    activity: string[];
};

// The null guard exists because the poll worker feeds raw fetch JSON into
// the query cache; the consecutive dedupe because a retry can restart the
// generation stream and re-emit the same entry.
export function versionNarrationTexts(
    history: AppVersionStatusHistoryEntry[] | undefined,
    kind: AppVersionStatusHistoryEntryKind,
): string[] {
    return (history ?? [])
        .filter((entry) => entry.kind === kind)
        .map((entry) => entry.message)
        .filter((message, index, all) => message !== all[index - 1]);
}

export const getVersionNarration = (
    history: AppVersionStatusHistoryEntry[] | undefined,
): AppVersionNarrationData => ({
    reasoning: versionNarrationTexts(history, 'thinking'),
    activity: versionNarrationTexts(history, 'tool'),
});

export const hasVersionNarration = ({
    reasoning,
    activity,
}: AppVersionNarrationData): boolean =>
    reasoning.length > 0 || activity.length > 0;

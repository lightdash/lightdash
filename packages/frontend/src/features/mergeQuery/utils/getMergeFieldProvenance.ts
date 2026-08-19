import { type MergeFieldOrigin } from '@lightdash/common';

const fallbackSourceLabel = (sourceId: string) => {
    if (sourceId === 'a') return 'First result';
    if (sourceId === 'b') return 'Second result';
    return sourceId;
};

export const getMergeFieldProvenance = (
    origin: MergeFieldOrigin,
    sourceLabels: Record<string, string>,
): string => {
    if (origin.kind === 'source') {
        return `From ${sourceLabels[origin.sourceId] ?? fallbackSourceLabel(origin.sourceId)}`;
    }

    if (origin.kind === 'joinKey') {
        const labels = Object.keys(origin.fieldIdBySourceId).map(
            (sourceId) =>
                sourceLabels[sourceId] ?? fallbackSourceLabel(sourceId),
        );
        return `Shared join key: ${labels.join(' ↔ ')}`;
    }

    return 'Calculated after merging both queries';
};

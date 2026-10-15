import { type MergeFieldOrigin } from '@lightdash/common';
import i18n from '../../../i18n/i18n';

const ns = 'mergeQuery';

const fallbackSourceLabel = (sourceId: string) => {
    if (sourceId === 'a') return i18n.t('provenance.firstResult', { ns });
    if (sourceId === 'b') return i18n.t('provenance.secondResult', { ns });
    return sourceId;
};

export const getMergeFieldProvenance = (
    origin: MergeFieldOrigin,
    sourceLabels: Record<string, string>,
): string => {
    if (origin.kind === 'source') {
        return i18n.t('provenance.from', {
            ns,
            source:
                sourceLabels[origin.sourceId] ??
                fallbackSourceLabel(origin.sourceId),
        });
    }

    if (origin.kind === 'joinKey') {
        const labels = Object.keys(origin.fieldIdBySourceId).map(
            (sourceId) =>
                sourceLabels[sourceId] ?? fallbackSourceLabel(sourceId),
        );
        return i18n.t('provenance.sharedJoinKey', {
            ns,
            labels: labels.join(' ↔ '),
        });
    }

    return i18n.t('provenance.calculated', { ns });
};

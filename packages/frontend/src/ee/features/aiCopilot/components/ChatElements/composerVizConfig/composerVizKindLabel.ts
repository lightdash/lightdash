import { assertUnreachable, type ComposerVizKind } from '@lightdash/common';
import { type TFunction } from 'i18next';

export const getComposerVizKindLabelT = (
    kind: ComposerVizKind,
    t: TFunction,
): string => {
    switch (kind) {
        case 'table':
            return t('vizKind.table', { ns: 'aiCopilotChat' });
        case 'bar':
            return t('vizKind.bar', { ns: 'aiCopilotChat' });
        case 'line':
            return t('vizKind.line', { ns: 'aiCopilotChat' });
        case 'pie':
            return t('vizKind.pie', { ns: 'aiCopilotChat' });
        case 'big_number':
            return t('vizKind.bigNumber', { ns: 'aiCopilotChat' });
        default:
            return assertUnreachable(kind, 'Unknown composer viz kind');
    }
};

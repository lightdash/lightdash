import {
    ExternalSourceType,
    assertUnreachable,
    type SummaryExplore,
} from '@lightdash/common';
import { IconFileSpreadsheet } from '@tabler/icons-react';
import { TableIcon } from '../../../components/common/ContentIcons';

const getExternalSourceRef = (explore: SummaryExplore) =>
    'externalSource' in explore ? explore.externalSource : undefined;

/** Sidebar icon for an explore row; external tables show their source type. */
export const getExploreIcon = (explore: SummaryExplore) => {
    const ref = getExternalSourceRef(explore);
    if (!ref) return TableIcon;
    switch (ref.sourceType) {
        case ExternalSourceType.CSV:
            return IconFileSpreadsheet;
        case ExternalSourceType.GOOGLE_SHEETS:
            return IconFileSpreadsheet;
        default:
            return assertUnreachable(
                ref.sourceType,
                'Unknown external source type',
            );
    }
};

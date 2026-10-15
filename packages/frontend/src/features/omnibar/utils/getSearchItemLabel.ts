import { assertUnreachable, SearchItemType } from '@lightdash/common';
import i18n from '../../../i18n/i18n';
import { type SearchItem } from '../types/searchItem';

const ns = 'omnibar';

const getSearchItemTypeKey = (itemType: SearchItemType) => {
    switch (itemType) {
        case SearchItemType.FIELD:
            return 'field';
        case SearchItemType.DOCUMENT:
            return 'document';
        case SearchItemType.DASHBOARD:
            return 'dashboard';
        case SearchItemType.DASHBOARD_TAB:
            return 'dashboardTab';
        case SearchItemType.CHART:
            return 'chart';
        case SearchItemType.SPACE:
            return 'space';
        case SearchItemType.TABLE:
            return 'table';
        case SearchItemType.PAGE:
            return 'page';
        case SearchItemType.SQL_CHART:
            return 'sqlChart';
        case SearchItemType.DATA_APP:
            return 'dataApp';
        case SearchItemType.SETTINGS:
            return 'settings';
        default:
            return assertUnreachable(
                itemType,
                `Unknown search item type: ${itemType}`,
            );
    }
};

export const getSearchItemLabel = (itemType: SearchItemType) =>
    i18n.t(`itemTypes.plural.${getSearchItemTypeKey(itemType)}`, { ns });

/** Names a single item, e.g. the preview kicker. */
export const getSearchItemSingularLabel = (itemType: SearchItemType) =>
    i18n.t(`itemTypes.singular.${getSearchItemTypeKey(itemType)}`, { ns });

export const getSearchItemTypeLabel = (
    typeLabel: NonNullable<SearchItem['typeLabel']>,
) => {
    switch (typeLabel) {
        case 'Table':
            return i18n.t('typeLabels.table', { ns });
        case 'Joined table':
            return i18n.t('typeLabels.joinedTable', { ns });
        case 'Dimension':
            return i18n.t('typeLabels.dimension', { ns });
        case 'Metric':
            return i18n.t('typeLabels.metric', { ns });
        default:
            return assertUnreachable(typeLabel, 'Unknown type label');
    }
};

export const getSearchItemErrorLabel = (itemType: SearchItemType) => {
    switch (itemType) {
        case SearchItemType.FIELD:
            return i18n.t('itemTypes.error.field', { ns });
        case SearchItemType.DASHBOARD:
            return i18n.t('itemTypes.error.dashboard', { ns });
        case SearchItemType.DASHBOARD_TAB:
            return i18n.t('itemTypes.error.dashboardTab', { ns });
        case SearchItemType.CHART:
            return i18n.t('itemTypes.error.chart', { ns });
        case SearchItemType.SPACE:
        case SearchItemType.TABLE:
        case SearchItemType.PAGE:
        case SearchItemType.DATA_APP:

        default:
            return new Error(`Unknown error item type: ${itemType}`);
    }
};

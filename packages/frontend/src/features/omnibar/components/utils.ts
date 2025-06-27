import {
    SearchItemType,
    assertUnreachable,
    type SavedChartSearchResult,
} from '@lightdash/common';
import {
    Icon123,
    IconAbc,
    IconBrowser,
    IconFolder,
    IconLayoutDashboard,
    IconLayoutNavbarInactive,
    IconTable,
} from '@tabler/icons-react';
import { getChartIcon } from '../../../components/common/ResourceIcon/utils';
import { type SearchItem } from '../types/searchItem';

export const getOmnibarItemColor = (itemType: SearchItemType) => {
    switch (itemType) {
        case SearchItemType.FIELD:
            return 'gray.7';
        case SearchItemType.DASHBOARD_TAB:
        case SearchItemType.DASHBOARD:
            return 'green.6';
        case SearchItemType.CHART:
            return 'blue.6';
        case SearchItemType.SPACE:
            return 'violet.6';
        case SearchItemType.TABLE:
            return 'cyan.8';
        case SearchItemType.PAGE:
            return 'gray.7';
        case SearchItemType.SQL_CHART:
            return 'blue.7';
        default:
            return assertUnreachable(
                itemType,
                `Unknown search item type: ${itemType}`,
            );
    }
};

export const getOmnibarItemIcon = (item: SearchItem) => {
    switch (item.type) {
        case SearchItemType.FIELD:
            if (item.typeLabel?.toLowerCase() === 'dimension') {
                return IconAbc;
            } else {
                return Icon123;
            }
        case SearchItemType.DASHBOARD:
            return IconLayoutDashboard;
        case SearchItemType.CHART:
        case SearchItemType.SQL_CHART:
            return getChartIcon(
                // FIXME: typing is loose here
                (item.item as SavedChartSearchResult)?.chartType,
            );
        case SearchItemType.SPACE:
            return IconFolder;
        case SearchItemType.TABLE:
            return IconTable;
        case SearchItemType.PAGE:
            return IconBrowser;
        case SearchItemType.DASHBOARD_TAB:
            return IconLayoutNavbarInactive;
        default:
            return assertUnreachable(
                item.type,
                `Unknown search item type: ${item.type}`,
            );
    }
};

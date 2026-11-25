import {
    assertUnreachable,
    getDocumentUrl,
    ResourceViewItemType,
    type ResourceViewItem,
} from '@lightdash/common';
import {
    IconAppWindow,
    IconChartAreaLine,
    IconFileText,
    IconFolder,
    IconLayoutDashboard,
} from '@tabler/icons-react';

export const getFavoriteItemUrl = (
    projectUuid: string,
    projectUrlIdentifier: string,
    item: ResourceViewItem,
) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return `/projects/${projectUrlIdentifier}/dashboards/${item.data.slug}/view`;
        case ResourceViewItemType.CHART:
            return `/projects/${projectUrlIdentifier}/saved/${item.data.slug}`;
        case ResourceViewItemType.SPACE:
            return `/projects/${projectUrlIdentifier}/spaces/${item.data.uuid}`;
        case ResourceViewItemType.DATA_APP:
            return `/projects/${projectUuid}/apps/${item.data.uuid}/view`;
        case ResourceViewItemType.DOCUMENT:
            return getDocumentUrl(
                projectUrlIdentifier,
                item.data.uuid,
                item.data.slug,
            );
        default:
            return assertUnreachable(item, `Unknown favorite item type`);
    }
};

export const getFavoriteItemIcon = (item: ResourceViewItem) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return IconLayoutDashboard;
        case ResourceViewItemType.CHART:
            return IconChartAreaLine;
        case ResourceViewItemType.SPACE:
            return IconFolder;
        case ResourceViewItemType.DATA_APP:
            return IconAppWindow;
        case ResourceViewItemType.DOCUMENT:
            return IconFileText;
        default:
            return assertUnreachable(item, `Unknown favorite item type`);
    }
};

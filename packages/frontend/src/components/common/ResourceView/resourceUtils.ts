import {
    assertUnreachable,
    ChartKind,
    ChartSourceType,
    ResourceViewItemType,
    getDocumentUrl,
    type ResourceViewChartItem,
    type ResourceViewItem,
} from '@lightdash/common';
import dayjs from 'dayjs';
import i18n from '../../../i18n/i18n';

const tr = (key: string, options?: Record<string, unknown>) =>
    i18n.t(key, { ns: 'resourceView', ...options });

export const getResourceTypeName = (item: ResourceViewItem) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return tr('resourceType.dashboard');
        case ResourceViewItemType.SPACE:
            return tr('resourceType.space');
        case ResourceViewItemType.DATA_APP:
            return tr('resourceType.dataApp');
        case ResourceViewItemType.DOCUMENT:
            return tr('resourceType.document');
        case ResourceViewItemType.CHART:
            switch (item.data.chartKind) {
                case undefined:
                case ChartKind.VERTICAL_BAR:
                    return tr('resourceType.barChart');
                case ChartKind.HORIZONTAL_BAR:
                    return tr('resourceType.horizontalBarChart');
                case ChartKind.LINE:
                    return tr('resourceType.lineChart');
                case ChartKind.SCATTER:
                    return tr('resourceType.scatterChart');
                case ChartKind.AREA:
                    return tr('resourceType.areaChart');
                case ChartKind.MIXED:
                    return tr('resourceType.mixedChart');
                case ChartKind.PIE:
                    return tr('resourceType.pieChart');
                case ChartKind.FUNNEL:
                    return tr('resourceType.funnelChart');
                case ChartKind.TREEMAP:
                    return tr('resourceType.treemap');
                case ChartKind.GAUGE:
                    return tr('resourceType.gauge');
                case ChartKind.TABLE:
                    return tr('resourceType.table');
                case ChartKind.BIG_NUMBER:
                    return tr('resourceType.bigNumber');
                case ChartKind.CUSTOM:
                    return tr('resourceType.customChart');
                case ChartKind.MAP:
                    return tr('resourceType.map');
                case ChartKind.SANKEY:
                    return tr('resourceType.sankey');
                case ChartKind.DATA_APP_VIZ:
                    return tr('resourceType.customChart');
                default:
                    return tr('resourceType.chart');
            }
        default:
            return assertUnreachable(item, 'Resource type not supported');
    }
};

const getChartResourceUrl = (
    projectUuid: string,
    projectUrlIdentifier: string,
    item: ResourceViewChartItem,
) => {
    switch (item.data.source) {
        case ChartSourceType.SQL:
            return `/projects/${projectUuid}/sql-runner/${item.data.slug}`;
        case ChartSourceType.DBT_EXPLORE:
        case undefined:
            return `/projects/${projectUrlIdentifier}/saved/${item.data.slug}`;
        default:
            return assertUnreachable(
                item.data.source,
                `Unknown source type: ${item.data.source}`,
            );
    }
};

export const getViewStatsResourceType = (
    item: ResourceViewItem,
): 'chart' | 'dashboard' | undefined => {
    if (item.type === ResourceViewItemType.DASHBOARD) return 'dashboard';
    if (
        item.type === ResourceViewItemType.CHART &&
        item.data.source !== ChartSourceType.SQL
    )
        return 'chart';
    return undefined;
};

export const getResourceUrl = (
    projectUuid: string,
    item: ResourceViewItem,
    projectUrlIdentifier = projectUuid,
) => {
    const itemType = item.type;
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return `/projects/${projectUrlIdentifier}/dashboards/${item.data.slug}/view`;
        case ResourceViewItemType.CHART:
            return getChartResourceUrl(projectUuid, projectUrlIdentifier, item);
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
            return assertUnreachable(item, `Can't get URL for ${itemType}`);
    }
};

export const getResourceName = (type: ResourceViewItemType) => {
    switch (type) {
        case ResourceViewItemType.DASHBOARD:
            return tr('resourceType.dashboard');
        case ResourceViewItemType.CHART:
            return tr('resourceType.chart');
        case ResourceViewItemType.SPACE:
            return tr('resourceType.space');
        case ResourceViewItemType.DATA_APP:
            return tr('resourceType.dataApp');
        case ResourceViewItemType.DOCUMENT:
            return tr('resourceType.document');
        default:
            return assertUnreachable(type, 'Resource type not supported');
    }
};

export const getResourceNamePlural = (type: ResourceViewItemType) => {
    switch (type) {
        case ResourceViewItemType.DASHBOARD:
            return tr('resourceTypePlural.dashboard');
        case ResourceViewItemType.CHART:
            return tr('resourceTypePlural.chart');
        case ResourceViewItemType.SPACE:
            return tr('resourceTypePlural.space');
        case ResourceViewItemType.DATA_APP:
            return tr('resourceTypePlural.dataApp');
        case ResourceViewItemType.DOCUMENT:
            return tr('resourceTypePlural.document');
        default:
            return assertUnreachable(type, 'Resource type not supported');
    }
};

export const getResourceViewsSinceWhenDescription = (
    item: ResourceViewItem,
) => {
    if (
        item.type !== ResourceViewItemType.CHART &&
        item.type !== ResourceViewItemType.DASHBOARD &&
        item.type !== ResourceViewItemType.DATA_APP
    ) {
        throw new Error('Only supported for charts, dashboards and data apps');
    }

    return item.data.firstViewedAt
        ? tr('views.sinceDate', {
              count: item.data.views,
              date: dayjs(item.data.firstViewedAt).format('MMM D, YYYY h:mm A'),
          })
        : undefined;
};

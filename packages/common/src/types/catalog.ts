import assertUnreachable from '../utils/assertUnreachable';
import { type InlineError } from './explore';
import {
    DimensionType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type Dimension,
    type Field,
    type FieldType,
    type Metric,
} from './field';
import type { KnexPaginatedData } from './knex-paginate';
import { type ChartSummary } from './savedCharts';
import { type TraceTaskBase } from './scheduler';
import { type TableBase } from './table';
import type { Tag } from './tags';

export enum CatalogType {
    Table = 'table',
    Field = 'field',
}

export enum CatalogFilter {
    Tables = 'tables',
    Dimensions = 'dimensions',
    Metrics = 'metrics',
}

export type CatalogSelection = {
    group: string;
    table?: string;
    field?: string;
};

export type ApiCatalogSearch = {
    searchQuery?: string;
    type?: CatalogType;
    filter?: CatalogFilter;
    catalogTags?: string[];
};

type EmojiIcon = {
    unicode: string;
};

type CustomIcon = {
    url: string;
};

export type CatalogItemIcon = EmojiIcon | CustomIcon;

export const UNCATEGORIZED_TAG_UUID = '__uncategorized__';

export const isEmojiIcon = (icon: CatalogItemIcon | null): icon is EmojiIcon =>
    Boolean(icon && 'unicode' in icon);

export const isCustomIcon = (
    icon: CatalogItemIcon | null,
): icon is CustomIcon => Boolean(icon && 'url' in icon);

export type CatalogField = Pick<
    Field,
    'name' | 'label' | 'fieldType' | 'tableLabel' | 'description'
> &
    Pick<Dimension, 'requiredAttributes'> & {
        catalogSearchUuid: string;
        type: CatalogType.Field;
        basicType: 'string' | 'number' | 'date' | 'timestamp' | 'boolean';
        fieldValueType: Metric['type'] | Dimension['type'];
        tableName: string;
        tableGroupLabel?: string;
        tags?: string[]; // Tags from table, for filtering
        categories: Pick<Tag, 'name' | 'color' | 'tagUuid' | 'yamlReference'>[]; // Tags manually added by the user in the catalog
        chartUsage: number | undefined;
        icon: CatalogItemIcon | null;
        aiHints: string[] | null;
        searchRank?: number;
    };

export type CatalogTable = Pick<
    TableBase,
    'name' | 'label' | 'groupLabel' | 'description' | 'requiredAttributes'
> & {
    catalogSearchUuid: string;
    errors?: InlineError[]; // For explore errors
    type: CatalogType.Table;
    groupLabel?: string;
    tags?: string[];
    categories: Pick<Tag, 'name' | 'color' | 'tagUuid' | 'yamlReference'>[]; // Tags manually added by the user in the catalog
    chartUsage: number | undefined;
    icon: CatalogItemIcon | null;
    aiHints: string[] | null;
    joinedTables: string[] | null;
    searchRank?: number;
};

export type CatalogItem = CatalogField | CatalogTable;

export type CatalogMetricsTreeNode = Pick<
    CatalogField,
    'catalogSearchUuid' | 'name' | 'tableName'
>;

export type CatalogMetricsTreeEdge = {
    source: CatalogMetricsTreeNode;
    target: CatalogMetricsTreeNode;
    createdAt: Date;
    createdByUserUuid: string | null;
    projectUuid: string;
};

export type ApiCatalogResults = CatalogItem[];

export type ApiMetricsCatalogResults = CatalogField[];

export type ApiMetricsCatalog = {
    status: 'ok';
    results: KnexPaginatedData<ApiMetricsCatalogResults>;
};

export type MetricWithAssociatedTimeDimension = CompiledMetric & {
    timeDimension:
        | (CompiledMetric['defaultTimeDimension'] & { table: string })
        | undefined;
    availableTimeDimensions?: (CompiledDimension & {
        type: DimensionType.DATE | DimensionType.TIMESTAMP;
    })[];
};

export type ApiGetMetricPeek = {
    status: 'ok';
    results: MetricWithAssociatedTimeDimension;
};

export type ApiGetMetricsTree = {
    status: 'ok';
    results: {
        edges: CatalogMetricsTreeEdge[];
    };
};

export type ApiMetricsTreeEdgePayload = {
    sourceCatalogSearchUuid: string;
    targetCatalogSearchUuid: string;
};

export type CatalogMetadata = {
    name: string;
    description: string | undefined;
    label: string;
    // TODO Tags
    modelName: string;
    source: string | undefined;
    fields: CatalogField[];
    joinedTables: string[];
    tableLabel?: string;
    fieldType?: FieldType;
};
export type ApiCatalogMetadataResults = CatalogMetadata;

export type CatalogAnalytics = {
    charts: Pick<
        ChartSummary,
        | 'uuid'
        | 'name'
        | 'spaceUuid'
        | 'spaceName'
        | 'dashboardName'
        | 'dashboardUuid'
        | 'chartKind'
    >[];
};
export type ApiCatalogAnalyticsResults = CatalogAnalytics;

export const getBasicType = (field: CompiledDimension | CompiledMetric) => {
    const { type } = field;
    switch (type) {
        case DimensionType.STRING:
        case MetricType.STRING:
            return 'string' as const;
        case DimensionType.NUMBER:
        case MetricType.NUMBER:
        case MetricType.PERCENTILE:
        case MetricType.MEDIAN:
        case MetricType.AVERAGE:
        case MetricType.COUNT:
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM:
        case MetricType.MIN:
        case MetricType.MAX:
        case MetricType.PERCENT_OF_PREVIOUS:
        case MetricType.PERCENT_OF_TOTAL:
        case MetricType.RUNNING_TOTAL:
            return 'number' as const;
        case DimensionType.DATE:
        case MetricType.DATE:
            return 'date' as const;
        case DimensionType.TIMESTAMP:
        case MetricType.TIMESTAMP:
            return 'timestamp' as const;
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN:
            return 'boolean' as const;
        default:
            return assertUnreachable(type, `Invalid field type ${type}`);
    }
};

export type CatalogFieldMap = {
    [fieldId: string]: {
        fieldName: string;
        tableName: string;
        cachedExploreUuid: string;
        fieldType: FieldType;
    };
};

export type CatalogItemSummary = Pick<
    CatalogItem,
    'catalogSearchUuid' | 'name' | 'type'
> & {
    projectUuid: string;
    cachedExploreUuid: string;
    tableName: string;
    fieldType: string | undefined;
};

export type CatalogItemWithTagUuids = CatalogItemSummary & {
    catalogTags: {
        tagUuid: string;
        createdByUserUuid: string | null;
        createdAt: Date;
        taggedViaYaml: boolean;
    }[];
};

export type CatalogItemsWithIcons = CatalogItemSummary &
    Pick<CatalogItem, 'icon'>;

export type SchedulerIndexCatalogJobPayload = TraceTaskBase & {
    prevCatalogItemsWithTags: CatalogItemWithTagUuids[];
    prevCatalogItemsWithIcons: CatalogItemsWithIcons[];
    prevMetricTreeEdges: CatalogMetricsTreeEdge[];
};

export type ChartFieldUpdates = {
    oldChartFields: {
        metrics: string[];
        dimensions: string[];
    };
    newChartFields: {
        metrics: string[];
        dimensions: string[];
    };
};

export type ChartFieldChanges = {
    added: {
        dimensions: string[];
        metrics: string[];
    };
    removed: {
        dimensions: string[];
        metrics: string[];
    };
};

export type CatalogFieldWhere = {
    fieldName: string;
    fieldType: FieldType;
    cachedExploreUuid: string;
};

export type ChartFieldUsageChanges = {
    fieldsToIncrement: CatalogFieldWhere[];
    fieldsToDecrement: CatalogFieldWhere[];
};

export type ChartUsageIn = CatalogFieldWhere & {
    chartUsage: number;
};

export type ApiMetricsWithAssociatedTimeDimensionResponse = {
    status: 'ok';
    results: MetricWithAssociatedTimeDimension[];
};

export type ApiSegmentDimensionsResponse = {
    status: 'ok';
    results: CompiledDimension[];
};

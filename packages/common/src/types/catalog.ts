import assertUnreachable from '../utils/assertUnreachable';
import {
    type CompiledExploreJoin,
    type CompiledTable,
    type Explore,
    type ExploreError,
    type InlineError,
} from './explore';
import {
    DimensionType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type Dimension,
    type Field,
    type FieldType,
} from './field';
import type { KnexPaginatedData } from './knex-paginate';
import { type ChartSummary } from './savedCharts';
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
        basicType?: string; // string, number, timestamp... used in metadata
        tableName: string;
        tableGroupLabel?: string;
        tags?: string[]; // Tags from table, for filtering
        categories: Pick<Tag, 'name' | 'color' | 'tagUuid'>[]; // Tags manually added by the user in the catalog
        chartUsage: number | undefined;
        icon: CatalogItemIcon | null;
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
    categories: Pick<Tag, 'name' | 'color' | 'tagUuid'>[]; // Tags manually added by the user in the catalog
    joinedTables?: CompiledExploreJoin[]; // Matched type in explore
    chartUsage: number | undefined;
    icon: CatalogItemIcon | null;
};

export type CatalogItem = CatalogField | CatalogTable;

export type ApiCatalogResults = CatalogItem[];

export type ApiMetricsCatalogResults = CatalogField[];

export type ApiMetricsCatalog = {
    status: 'ok';
    results: KnexPaginatedData<ApiMetricsCatalogResults>;
};

export type MetricWithAssociatedTimeDimension = CompiledMetric &
    Pick<CompiledTable, 'defaultTimeDimension'>;

export type ApiGetMetricPeek = {
    status: 'ok';
    results: MetricWithAssociatedTimeDimension;
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

export const getBasicType = (
    field: CompiledDimension | CompiledMetric,
): string => {
    const { type } = field;
    switch (type) {
        case DimensionType.STRING:
        case MetricType.STRING:
            return 'string';

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
            return 'number';
        case DimensionType.DATE:
        case MetricType.DATE:
            return 'date';
        case DimensionType.TIMESTAMP:
        case MetricType.TIMESTAMP:
            return 'timestamp';
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN:
            return 'boolean';
        default:
            return assertUnreachable(type, `Invalid field type ${type}`);
    }
};

export type CatalogFieldMap = {
    [fieldId: string]: {
        fieldName: string;
        tableName: string;
        cachedExploreUuid: string;
    };
};

export type CatalogItemWithTagUuids = Pick<
    CatalogItem,
    'catalogSearchUuid' | 'name' | 'type'
> & {
    cachedExploreUuid: string;
    projectUuid: string;
    fieldType?: string; // This comes from db, so it is string, this type is mostly used to compare when migrating tags
    exploreBaseTable: string;
    catalogTags: {
        tagUuid: string;
        createdByUserUuid: string | null;
        createdAt: Date;
    }[];
};

export type CatalogItemsWithIcons = Pick<
    CatalogItem,
    'catalogSearchUuid' | 'icon' | 'name' | 'type'
> &
    Pick<
        CatalogItemWithTagUuids,
        'cachedExploreUuid' | 'projectUuid' | 'fieldType' | 'exploreBaseTable'
    >;

export type SchedulerIndexCatalogJobPayload = {
    projectUuid: string;
    explores: (Explore | ExploreError)[];
    userUuid: string;
    prevCatalogItemsWithTags: CatalogItemWithTagUuids[];
    prevCatalogItemsWithIcons: CatalogItemsWithIcons[];
};

export type CatalogFieldWhere = {
    fieldName: string;
    cachedExploreUuid: string;
};

export type ChartUsageIn = CatalogFieldWhere & {
    chartUsage: number;
};

export const indexCatalogJob = 'indexCatalog';

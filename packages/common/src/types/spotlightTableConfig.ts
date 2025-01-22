export enum SpotlightTableColumns {
    // These must match the keys of CatalogField type
    METRIC = 'label',
    TABLE = 'tableLabel',
    DESCRIPTION = 'description',
    CATEGORIES = 'categories',
    CHART_USAGE = 'chartUsage',
}

type ColumnConfig = Array<{
    column: SpotlightTableColumns;
    isVisible: boolean;
}>;

export type SpotlightTableConfig = {
    spotlightTableConfigUuid: string;
    projectUuid: string;
    columnConfig: ColumnConfig;
};

export const DEFAULT_SPOTLIGHT_TABLE_COLUMN_CONFIG: ColumnConfig = [
    { column: SpotlightTableColumns.METRIC, isVisible: true },
    { column: SpotlightTableColumns.TABLE, isVisible: false },
    { column: SpotlightTableColumns.DESCRIPTION, isVisible: true },
    { column: SpotlightTableColumns.CATEGORIES, isVisible: true },
    { column: SpotlightTableColumns.CHART_USAGE, isVisible: true },
];

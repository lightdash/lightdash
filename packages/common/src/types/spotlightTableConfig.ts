export enum SpotlightTableColumns {
    METRIC = 'label',
    TABLE = 'table',
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

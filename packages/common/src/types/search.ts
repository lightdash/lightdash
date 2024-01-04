import { Dashboard } from './dashboard';
import { Table } from './explore';
import { Dimension, Metric } from './field';
import { ChartKind, SavedChart } from './savedCharts';
import { Space } from './space';
import {
    ValidationErrorChartResponse,
    ValidationErrorDashboardResponse,
    ValidationErrorTableResponse,
} from './validation';

export type SpaceSearchResult = Pick<Space, 'uuid' | 'name' | 'uuid'>;
export type DashboardSearchResult = Pick<
    Dashboard,
    'uuid' | 'name' | 'description' | 'spaceUuid'
> & {
    validationErrors: {
        validationId: ValidationErrorDashboardResponse['validationId'];
    }[];
};

export type SavedChartSearchResult = Pick<
    SavedChart,
    'uuid' | 'name' | 'description' | 'spaceUuid'
> & {
    chartType: ChartKind;
    validationErrors: {
        validationId: ValidationErrorChartResponse['validationId'];
    }[];
};
export type TableSearchResult = Pick<
    Table,
    'name' | 'label' | 'description'
> & {
    explore: string;
    exploreLabel: string;
};

export type TableErrorSearchResult = Pick<
    TableSearchResult,
    'explore' | 'exploreLabel'
> & {
    validationErrors: {
        validationId: ValidationErrorTableResponse['validationId'];
    }[];
};

export type FieldSearchResult = Pick<
    Dimension | Metric,
    | 'name'
    | 'label'
    | 'description'
    | 'type'
    | 'fieldType'
    | 'table'
    | 'tableLabel'
> & {
    requiredAttributes?: Record<string, string | string[]>;
    explore: string;
    exploreLabel: string;
};

type PageResult = {
    uuid: string;
    name: string;
    url: string;
};

export type SearchResult =
    | SpaceSearchResult
    | DashboardSearchResult
    | SavedChartSearchResult
    | TableErrorSearchResult
    | TableSearchResult
    | FieldSearchResult
    | PageResult;

export const isExploreSearchResult = (
    value: SearchResult,
): value is TableSearchResult | FieldSearchResult => 'explore' in value;

export const isFieldSearchResult = (
    value: SearchResult,
): value is FieldSearchResult => 'table' in value;

export const isTableErrorSearchResult = (
    value: SearchResult,
): value is TableErrorSearchResult =>
    'explore' in value && 'validationErrors' in value;

export type SearchResults = {
    spaces: SpaceSearchResult[];
    dashboards: DashboardSearchResult[];
    savedCharts: SavedChartSearchResult[];
    tables: (TableSearchResult | TableErrorSearchResult)[];
    fields: FieldSearchResult[];
    pages: PageResult[];
};

export const getSearchResultId = (meta: SearchResult | undefined) => {
    if (!meta || isTableErrorSearchResult(meta)) {
        return '';
    }
    if (isExploreSearchResult(meta)) {
        if (isFieldSearchResult(meta)) {
            return `${meta.explore}.${meta.table}.${meta.name}`;
        }
        return `${meta.explore}.${meta.name}`;
    }
    return meta.uuid;
};

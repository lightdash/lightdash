import type { SavedChart } from '..';

export const currentVersion = 1;
// We want to only use properties that can be modified by the user
// We'll be using slug to access these charts, so uuids are not included
// These are not linked to a project or org, so projectUuid is not included
export type ChartAsCode = Pick<
    SavedChart,
    | 'name'
    | 'description'
    | 'tableName'
    | 'metricQuery'
    | 'chartConfig'
    | 'tableConfig'
    | 'slug'
    | 'dashboardUuid'
    | 'colorPalette'
    | 'updatedAt' // Not modifiable by user, but useful to know if it has been updated
> & {
    version: number;
    spaceSlug: string; // Charts within dashboards will be pointing to spaceSlug of the dashboard by design
};

export type ApiChartAsCodeListResponse = {
    status: 'ok';
    results: ChartAsCode[];
};

export type ApiChartAsCodeUpsertResponse = {
    status: 'ok';
    results: {
        chart: ChartAsCode;
        created: boolean;
    };
};

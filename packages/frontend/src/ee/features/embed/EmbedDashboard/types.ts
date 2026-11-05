import { type FilterOperator } from '@lightdash/common';

export type SdkFilter = {
    model: string;
    field: string;
    operator: `${FilterOperator}`;
    value: unknown;
};

// Where the embedded dashboard builder's chart editor may save new charts
export type ChartSaveDestination = 'dashboard' | 'space';

// The dashboard the builder's chart editor saves into, and the destinations it offers
export type EmbedChartSaveDashboard = {
    uuid: string;
    name: string;
    destinations: ChartSaveDestination[];
};

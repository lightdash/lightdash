import { type ChartTypeIcon } from '@lightdash/common';

/** The identity slice of a chart type the builder headers work with. */
export type ChartTypeAppMeta = {
    appUuid: string;
    name: string;
    description: string;
    icon: ChartTypeIcon | null;
};

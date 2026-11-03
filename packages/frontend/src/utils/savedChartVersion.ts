import { type SavedChart } from '@lightdash/common';
import { pick } from 'es-toolkit';

const savedChartVersionKeys = [
    'tableName',
    'metricQuery',
    'chartConfig',
    'tableConfig',
    'pivotConfig',
    'parameters',
    'merge',
    'colorPaletteUuid',
] as const;

/** The fields a saved chart version defines, without server metadata like name or pins. */
export const pickSavedChartVersion = (chart: SavedChart | undefined) =>
    chart ? pick(chart, savedChartVersionKeys) : {};

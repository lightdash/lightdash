/**
 * The secondary picker offers two kinds of custom chart type in one list: the
 * built-in Vega editor and the project's reusable types. They map to different
 * `ChartType`s, so the option value is prefixed rather than being a bare uuid.
 */
export type CustomChartTypeOption =
    | { kind: 'builtInVega' }
    | { kind: 'projectType'; dataAppVizUuid: string };

const BUILT_IN_VEGA_VALUE = 'builtIn:vega';
const PROJECT_TYPE_PREFIX = 'project:';

export const toOptionValue = (option: CustomChartTypeOption): string =>
    option.kind === 'builtInVega'
        ? BUILT_IN_VEGA_VALUE
        : `${PROJECT_TYPE_PREFIX}${option.dataAppVizUuid}`;

export const fromOptionValue = (
    value: string,
): CustomChartTypeOption | null => {
    if (value === BUILT_IN_VEGA_VALUE) return { kind: 'builtInVega' };
    if (value.startsWith(PROJECT_TYPE_PREFIX)) {
        const dataAppVizUuid = value.slice(PROJECT_TYPE_PREFIX.length);
        return dataAppVizUuid ? { kind: 'projectType', dataAppVizUuid } : null;
    }
    return null;
};

export const BUILT_IN_VEGA_LABEL = 'Vega (JSON editor)';
export const BUILT_IN_VEGA_DESCRIPTION = 'Write Vega-Lite JSON by hand';
export const BUILT_IN_GROUP = 'Built in';
export const PROJECT_GROUP = 'Project';

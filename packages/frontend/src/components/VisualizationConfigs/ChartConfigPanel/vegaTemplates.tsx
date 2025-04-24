export enum TemplateType {
    BAR_CHART = 'Bar chart',
    HEATMAP = 'Heatmap',
    BUBBLE_PLOTS = 'Bubble plots',
}

const barChartTemplate = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    mark: 'bar',
    encoding: {
        x: {
            field: 'field_x',
            type: 'temporal',
        },
        y: {
            field: 'field_y',
            type: 'quantitative',
        },
    },
};

const heatmapTemplate = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    mark: 'rect',
    encoding: {
        x: {
            field: 'field_x',
            type: 'temporal',
            title: 'Week',
        },
        y: {
            field: 'field_y',
            type: 'ordinal',
            title: 'Day of Week',
        },

        color: {
            field: 'field_extra',
            type: 'quantitative',
            aggregate: 'sum',
            title: 'Issues Created',
        },
    },
};

const bubblePlotsTemplate = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    mark: 'point',
    encoding: {
        x: {
            field: 'field_x',
            type: 'temporal',
        },
        y: {
            field: 'field_y',
            type: 'quantitative',
        },
        size: {
            field: 'field_extra',
            type: 'quantitative',
        },
    },
};

const templateMap = {
    [TemplateType.BAR_CHART]: barChartTemplate,
    [TemplateType.HEATMAP]: heatmapTemplate,
    [TemplateType.BUBBLE_PLOTS]: bubblePlotsTemplate,
};

export const getTemplateByType = (type: TemplateType) => {
    return templateMap[type];
};

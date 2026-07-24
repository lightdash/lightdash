export enum TemplateType {
    BAR_CHART = 'Bar chart',
    HEATMAP = 'Heatmap',
    BUBBLE_PLOTS = 'Bubble plots',
    FUNNEL_CHART = 'Funnel chart',
    WATERFALL_CHART = 'Waterfall chart',
    MAP = 'World map',
}

const echartsAxisColor = '#6e7079';

// Query results are injected at render time, but vega-lite's JSON schema
// requires `data` on unit specs, so declare a named placeholder source
const resultsData = { name: 'results' };

const barChartTemplate = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: resultsData,
    mark: 'bar',
    encoding: {
        x: {
            field: 'field_x',
            type: 'field_type_x',
            axis: {
                labelColor: echartsAxisColor,
                tickColor: echartsAxisColor,
            },
        },
        y: {
            field: 'field_y',
            type: 'quantitative',
            axis: {
                labelColor: echartsAxisColor,
                tickColor: echartsAxisColor,
            },
        },
    },
};

const heatmapTemplate = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: resultsData,
    mark: 'rect',
    encoding: {
        x: {
            field: 'field_x',
            type: 'field_type_x',
            axis: {
                labelColor: echartsAxisColor,
                tickColor: echartsAxisColor,
            },
        },
        y: {
            field: 'field_y',
            type: 'quantitative',
            axis: {
                labelColor: echartsAxisColor,
                tickColor: echartsAxisColor,
            },
        },

        color: {
            field: 'field_extra',
            type: 'quantitative',
            aggregate: 'sum',
        },
    },
};

const bubblePlotsTemplate = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: resultsData,
    mark: 'point',
    encoding: {
        x: {
            field: 'field_x',
            type: 'field_type_x',
            axis: {
                labelColor: echartsAxisColor,
                tickColor: echartsAxisColor,
            },
        },
        y: {
            field: 'field_y',
            type: 'quantitative',
            axis: {
                labelColor: echartsAxisColor,
                tickColor: echartsAxisColor,
            },
        },
        size: {
            field: 'field_extra',
            type: 'quantitative',
        },
    },
};

const funnelChartTemplate = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    config: {
        view: {
            strokeWidth: 0,
        },
    },
    transform: [
        {
            calculate: "datum.field_y + ' ' + datum.field_x",
            as: 'label',
        },
        {
            window: [{ op: 'lag', field: 'field_y', as: 'previous_value' }],
            frame: [1, 0],
        },
        {
            calculate:
                'datum.previous_value ? (datum.field_y / datum.previous_value) * 100 : null',
            as: 'percent_of_previous',
        },
        {
            calculate:
                "isValid(datum.percent_of_previous) ? '↓ ' + format(datum.percent_of_previous, '.1f') + '%' : 'N/A'",
            as: 'change_label',
        },
    ],
    layer: [
        {
            mark: { type: 'bar' },
            encoding: {
                x: {
                    field: 'field_y',
                    type: 'quantitative',
                    stack: 'center',
                    axis: null,
                },
                y: {
                    field: 'field_x',
                    type: 'nominal',
                    axis: null,
                    sort: null,
                    scale: {
                        padding: 0.5,
                    },
                },
                color: {
                    field: 'field_y',
                    scale: {
                        scheme: 'lightgreyteal',
                    },
                },
            },
        },
        {
            mark: { type: 'text', color: 'black' },
            encoding: {
                y: {
                    field: 'field_x',
                    type: 'nominal',
                    axis: null,
                    sort: null,
                },
                text: { field: 'label' },
            },
        },
        {
            mark: { type: 'text', color: echartsAxisColor },
            encoding: {
                y: {
                    field: 'field_x',
                    type: 'nominal',
                    axis: null,
                    sort: null,
                },
                yOffset: { value: -9 },
                text: {
                    condition: {
                        test: "datum.change_label !== 'N/A'",
                        field: 'change_label',
                    },
                    value: '',
                },
            },
        },
    ],
};

const waterfallChartTemplate = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    transform: [
        {
            window: [{ op: 'sum', field: 'field_y', as: 'sum' }],
            frame: [null, 0],
        },
        {
            window: [{ op: 'lead', field: 'field_x', as: 'lead_x' }],
            frame: [0, 1],
        },
        {
            calculate: 'datum.lead_x === null ? datum.field_x : datum.lead_x',
            as: 'lead_x',
        },
        { calculate: 'datum.sum - datum.field_y', as: 'previous_sum' },
        { calculate: '(datum.sum + datum.previous_sum) / 2', as: 'center' },
    ],
    encoding: {
        x: {
            field: 'field_x',
            type: 'field_type_x',
            sort: null,
            axis: {
                labelColor: echartsAxisColor,
                tickColor: echartsAxisColor,
            },
        },
    },
    layer: [
        {
            mark: 'bar',
            encoding: {
                y: {
                    field: 'previous_sum',
                    type: 'quantitative',
                    title: 'field_y',
                    axis: {
                        labelColor: echartsAxisColor,
                        tickColor: echartsAxisColor,
                    },
                },
                y2: { field: 'sum' },
                color: {
                    condition: {
                        test: 'datum.field_y < 0',
                        value: '#dd6b66',
                    },
                    value: '#91cc75',
                },
            },
        },
        {
            mark: {
                type: 'rule',
                color: echartsAxisColor,
                opacity: 1,
                strokeWidth: 1,
                xOffset: -22,
                x2Offset: 22,
            },
            encoding: {
                x2: { field: 'lead_x' },
                y: { field: 'sum', type: 'quantitative' },
            },
        },
        {
            mark: { type: 'text', baseline: 'middle', dy: -8 },
            encoding: {
                y: { field: 'sum', type: 'quantitative' },
                text: { field: 'field_y', type: 'quantitative' },
                color: { value: 'black' },
            },
        },
    ],
};

const mapTemplate = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    projection: {
        // change scale and center to zoom into a region
        type: 'mercator',
        scale: 100,
        center: [10, 50],
    },
    layer: [
        {
            data: {
                url: '/vega-world-map.json',
                format: {
                    type: 'topojson',
                    feature: 'countries',
                },
            },
            mark: {
                fill: 'lightgray',
                type: 'geoshape',
                stroke: 'white',
            },
        },
        {
            mark: 'circle',
            encoding: {
                size: {
                    type: 'quantitative',
                    field: 'field_y',
                    legend: null, // Hide the legend for size
                },
                tooltip: [
                    {
                        type: 'field_type_x',
                        field: 'field_x',
                    },
                    {
                        type: 'nominal',
                        field: 'field_y',
                    },

                    {
                        type: 'quantitative',
                        field: 'latitude',
                    },
                    {
                        type: 'quantitative',
                        field: 'longitude',
                    },
                ],
                latitude: {
                    type: 'quantitative',
                    field: 'latitude',
                },
                longitude: {
                    type: 'quantitative',
                    field: 'longitude',
                },
            },
        },
    ],
};

const templateMap = {
    [TemplateType.BAR_CHART]: barChartTemplate,
    [TemplateType.HEATMAP]: heatmapTemplate,
    [TemplateType.BUBBLE_PLOTS]: bubblePlotsTemplate,
    [TemplateType.FUNNEL_CHART]: funnelChartTemplate,
    [TemplateType.WATERFALL_CHART]: waterfallChartTemplate,
    [TemplateType.MAP]: mapTemplate,
};

export const getTemplateByType = (type: TemplateType) => {
    return templateMap[type];
};

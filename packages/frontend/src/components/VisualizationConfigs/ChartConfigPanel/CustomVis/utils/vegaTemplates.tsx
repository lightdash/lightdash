export enum TemplateType {
    BAR_CHART = 'Bar chart',
    HEATMAP = 'Heatmap',
    BUBBLE_PLOTS = 'Bubble plots',
    FUNNEL_CHART = 'Funnel chart',
    WATERFALL_CHART = 'Waterfall chart',
    MAP = 'World map',
}

const echartsAxisColor = '#6e7079';

const barChartTemplate = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
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
    mark: 'funnel',
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
                    field: 'orders_status',
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
                    field: 'orders_status',
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
    $schema: 'https://vega.github.io/schema/vega-lite/v2.json',
    mark: 'waterfall',
    encoding: {
        x: {
            field: 'field_x',
            type: 'field_type_x',
        },
        y: {
            field: 'field_y',
            type: 'quantitative',
            axis: { title: 'field_y' },
        },
        y2: {
            field: 'field_extra',
            type: 'quantitative',
        },
    },
    layer: [
        {
            mark: 'bar',
            encoding: {
                color: {
                    type: 'ordinal',
                    _comment: 'chose a field to color by',
                    _field: 'type', //placeholder field for type
                    scale: {
                        domain: ['total', 'increase', 'decrease'],
                        range: ['blue', 'green', 'red'],
                    },
                },
            },
        },
        {
            mark: 'text',
            encoding: {
                y: {
                    field: 'field_y',
                    type: 'quantitative',
                },
                text: {
                    field: 'field_y',
                    type: 'nominal',
                },
                color: {
                    value: 'black',
                },
            },
        },
    ],
};

const mapTemplate = {
    projection: {
        type: 'mercator',
        _comment: 'change scale and center to zoom into a region',
        scale: 100,
        center: [10, 50],
    },
    mark: 'map',
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

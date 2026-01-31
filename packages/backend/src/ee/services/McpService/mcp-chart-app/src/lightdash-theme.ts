/**
 *  MCP App Theme for Lightdash
 *  NOTE: ideally this should share same colors as the Lightdash frontend theme, but for now we're using a simple theme that works well.
 */
export const lightdashTheme = {
    color: [
        '#8b8cf6',
        '#ff7a6b',
        '#ffb898',
        '#5dd9d2',
        '#ff7eb9',
        '#7cde96',
        '#ffc658',
        '#a78bfa',
        '#ff9b9b',
        '#64d2e8',
        '#33ffb1',
        '#33ffe6',
        '#33e6ff',
        '#33b1ff',
        '#337dff',
        '#3349ff',
        '#5e33ff',
        '#9233ff',
        '#c633ff',
        '#ff33e1',
    ],
    backgroundColor: 'rgba(0,0,0,0)',
    textStyle: {},
    line: {
        itemStyle: {
            borderWidth: 1,
        },
        lineStyle: {
            width: 2,
        },
        symbolSize: 3,
        symbol: 'emptyCircle',
        smooth: true,
    },
    bar: {
        itemStyle: {
            barBorderWidth: 0,
            barBorderColor: '#ccc',
        },
    },
    pie: {
        itemStyle: {
            borderWidth: 0,
            borderColor: '#ccc',
        },
    },
    scatter: {
        itemStyle: {
            borderWidth: 0,
            borderColor: '#ccc',
        },
    },
    funnel: {
        itemStyle: {
            borderWidth: 0,
            borderColor: '#e9e9e9',
        },
    },
    gauge: {
        itemStyle: {
            borderWidth: 0,
            borderColor: '#e9e9e9',
        },
    },
    candlestick: {
        itemStyle: {
            color: '#d87a80',
            color0: '#2ec7c9',
            borderColor: '#d87a80',
            borderColor0: '#2ec7c9',
            borderWidth: 1,
        },
    },
    graph: {
        itemStyle: {
            borderWidth: 0,
            borderColor: '#ccc',
        },
        lineStyle: {
            width: 1,
            color: '#aaa',
        },
        symbolSize: 3,
        symbol: 'emptyCircle',
        smooth: true,
        color: [
            '#8b8cf6',
            '#ff7a6b',
            '#ffb898',
            '#5dd9d2',
            '#ff7eb9',
            '#7cde96',
            '#ffc658',
            '#a78bfa',
            '#ff9b9b',
            '#64d2e8',
            '#33ffb1',
            '#33ffe6',
            '#33e6ff',
            '#33b1ff',
            '#337dff',
            '#3349ff',
            '#5e33ff',
            '#9233ff',
            '#c633ff',
            '#ff33e1',
        ],
        label: {
            color: '#eee',
        },
    },
    categoryAxis: {
        axisLine: {
            show: true,
            lineStyle: {
                color: '#ebebeb',
            },
        },
        axisTick: {
            show: true,
            lineStyle: {
                color: '#dedede',
            },
        },
        axisLabel: {
            show: false,
            color: '#333',
        },
        splitLine: {
            show: false,
            lineStyle: {
                color: ['#dedede'],
            },
        },
        splitArea: {
            show: false,
            areaStyle: {
                color: ['rgba(250,250,250,0.3)', 'rgba(200,200,200,0.3)'],
            },
        },
    },
    valueAxis: {
        axisLine: {
            show: true,
            lineStyle: {
                color: '#dedede',
            },
        },
        axisTick: {
            show: true,
            lineStyle: {
                color: '#dedede',
            },
        },
        axisLabel: {
            show: true,
            color: '#636363',
        },
        splitLine: {
            show: false,
            lineStyle: {
                color: ['#eee'],
            },
        },
        splitArea: {
            show: false,
            areaStyle: {
                color: ['rgba(250,250,250,0.3)', 'rgba(200,200,200,0.3)'],
            },
        },
    },
    logAxis: {
        axisLine: {
            show: true,
        },
        axisTick: {
            show: true,
            lineStyle: {
                color: '#dedede',
            },
        },
        axisLabel: {
            show: true,
            color: '#333',
        },
        splitLine: {
            show: true,
            lineStyle: {
                color: ['#e9e9e9'],
            },
        },
        splitArea: {
            show: true,
            areaStyle: {
                color: ['rgba(250,250,250,0.3)', 'rgba(200,200,200,0.3)'],
            },
        },
    },
    timeAxis: {
        axisLine: {
            show: true,
            lineStyle: {
                color: '#e9e9e9',
            },
        },
        axisTick: {
            show: true,
            lineStyle: {
                color: '#969696',
            },
        },
        axisLabel: {
            show: true,
            color: '#333',
        },
        splitLine: {
            show: true,
            lineStyle: {
                color: ['#e9e9e9'],
            },
        },
        splitArea: {
            show: false,
            areaStyle: {
                color: ['rgba(250,250,250,0.3)', 'rgba(200,200,200,0.3)'],
            },
        },
    },
    markPoint: {
        label: {
            color: '#e9e9e9',
        },
        emphasis: {
            label: {
                color: '#e9e9e9',
            },
        },
    },
    tooltip: {
        axisPointer: {
            label: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderColor: 'rgba(0, 0, 0, 0.1)',
                borderWidth: 1,
                color: '#636363',
                shadowBlur: 4,
                shadowColor: 'rgba(0, 0, 0, 0.08)',
                shadowOffsetX: 0,
                shadowOffsetY: 2,
            },
        },
    },
    axisPointer: {
        label: {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: 'rgba(0, 0, 0, 0.1)',
            borderWidth: 1,
            color: '#636363',
            shadowBlur: 4,
            shadowColor: 'rgba(0, 0, 0, 0.08)',
            shadowOffsetX: 0,
            shadowOffsetY: 2,
            padding: [6, 10],
        },
        lineStyle: {
            color: '#dedede',
            width: 1,
            type: 'dashed',
        },
    },
};

/**
 *  MCP App Theme for Lightdash
 *  Greys are `var(--app-*)` references (see global.css), resolved to the host's colours before ECharts reads them.
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
    title: {
        textStyle: {
            color: 'var(--app-text)',
        },
        subtextStyle: {
            color: 'var(--app-text-tertiary)',
        },
    },
    legend: {
        textStyle: {
            color: 'var(--app-text-secondary)',
        },
    },
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
            barBorderColor: 'var(--app-border)',
        },
    },
    pie: {
        itemStyle: {
            borderWidth: 0,
            borderColor: 'var(--app-border)',
        },
    },
    scatter: {
        itemStyle: {
            borderWidth: 0,
            borderColor: 'var(--app-border)',
        },
    },
    funnel: {
        itemStyle: {
            borderWidth: 0,
            borderColor: 'var(--app-border-tertiary)',
        },
    },
    gauge: {
        itemStyle: {
            borderWidth: 0,
            borderColor: 'var(--app-border-tertiary)',
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
            borderColor: 'var(--app-border)',
        },
        lineStyle: {
            width: 1,
            color: 'var(--app-text-tertiary)',
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
            color: 'var(--app-border-tertiary)',
        },
    },
    categoryAxis: {
        nameTextStyle: {
            color: 'var(--app-text-tertiary)',
        },
        axisLine: {
            show: true,
            lineStyle: {
                color: 'var(--app-border-tertiary)',
            },
        },
        axisTick: {
            show: true,
            lineStyle: {
                color: 'var(--app-border-tertiary)',
            },
        },
        axisLabel: {
            show: true,
            color: 'var(--app-text-secondary)',
        },
        splitLine: {
            show: false,
            lineStyle: {
                color: ['var(--app-border-tertiary)'],
            },
        },
        splitArea: {
            show: false,
            areaStyle: {
                color: ['rgba(0,0,0,0)', 'var(--app-bg-secondary)'],
            },
        },
    },
    valueAxis: {
        nameTextStyle: {
            color: 'var(--app-text-tertiary)',
        },
        axisLine: {
            show: true,
            lineStyle: {
                color: 'var(--app-border-tertiary)',
            },
        },
        axisTick: {
            show: true,
            lineStyle: {
                color: 'var(--app-border-tertiary)',
            },
        },
        axisLabel: {
            show: true,
            color: 'var(--app-text-tertiary)',
        },
        splitLine: {
            show: false,
            lineStyle: {
                color: ['var(--app-border-tertiary)'],
            },
        },
        splitArea: {
            show: false,
            areaStyle: {
                color: ['rgba(0,0,0,0)', 'var(--app-bg-secondary)'],
            },
        },
    },
    logAxis: {
        nameTextStyle: {
            color: 'var(--app-text-tertiary)',
        },
        axisLine: {
            show: true,
        },
        axisTick: {
            show: true,
            lineStyle: {
                color: 'var(--app-border-tertiary)',
            },
        },
        axisLabel: {
            show: true,
            color: 'var(--app-text-secondary)',
        },
        splitLine: {
            show: true,
            lineStyle: {
                color: ['var(--app-border-tertiary)'],
            },
        },
        splitArea: {
            show: true,
            areaStyle: {
                color: ['rgba(0,0,0,0)', 'var(--app-bg-secondary)'],
            },
        },
    },
    timeAxis: {
        nameTextStyle: {
            color: 'var(--app-text-tertiary)',
        },
        axisLine: {
            show: true,
            lineStyle: {
                color: 'var(--app-border-tertiary)',
            },
        },
        axisTick: {
            show: true,
            lineStyle: {
                color: 'var(--app-text-tertiary)',
            },
        },
        axisLabel: {
            show: true,
            color: 'var(--app-text-secondary)',
        },
        splitLine: {
            show: true,
            lineStyle: {
                color: ['var(--app-border-tertiary)'],
            },
        },
        splitArea: {
            show: false,
            areaStyle: {
                color: ['rgba(0,0,0,0)', 'var(--app-bg-secondary)'],
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
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border-tertiary)',
                borderWidth: 1,
                color: 'var(--app-text-tertiary)',
                shadowBlur: 4,
                shadowColor: 'rgba(0, 0, 0, 0.08)',
                shadowOffsetX: 0,
                shadowOffsetY: 2,
            },
        },
    },
    axisPointer: {
        label: {
            backgroundColor: 'var(--app-bg)',
            borderColor: 'var(--app-border-tertiary)',
            borderWidth: 1,
            color: 'var(--app-text-tertiary)',
            shadowBlur: 4,
            shadowColor: 'rgba(0, 0, 0, 0.08)',
            shadowOffsetX: 0,
            shadowOffsetY: 2,
            padding: [6, 10],
        },
        lineStyle: {
            color: 'var(--app-border-tertiary)',
            width: 1,
            type: 'dashed',
        },
    },
};

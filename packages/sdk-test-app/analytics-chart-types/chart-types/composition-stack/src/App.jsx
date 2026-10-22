import {
    resolveValueColor,
    useColorScheme,
    useVizContext,
} from '@lightdash/query-sdk';
import { useState } from 'react';
import {
    Bar,
    CartesianGrid,
    ComposedChart,
    LabelList,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import './lightdash-library.css';
import './controls.css';
import {
    formatValue,
    getValuePrefix,
    getDistinctValues,
    getPeriods,
    readToken,
    sumByPeriodAndGroup,
} from './aggregate';
import { SeriesChips, toggleKey } from './controls';

const FALLBACK_COLORS = [
    '#f08a4b',
    '#5468c4',
    '#a3a6d9',
    '#3b2cc9',
    '#9b93e6',
    '#14937b',
];
const TOTAL_KEY = '__total';

function App() {
    const context = useVizContext();
    const { fieldMapping, fields, rows, options, colorPalette, ready } =
        context;
    useColorScheme();
    const [hiddenComponents, setHiddenComponents] = useState(() => new Set());

    if (!ready) return <div className="placeholder" />;

    const timeField = fieldMapping.time;
    const componentField = fieldMapping.component;
    const valueField = fieldMapping.value;
    if (!timeField || !componentField || !valueField) {
        return (
            <div className="placeholder">
                Map the Period, Component and Value fields to see the chart.
            </div>
        );
    }
    if (rows.length === 0) {
        return <div className="placeholder">No results for these filters.</div>;
    }

    const { subtitle, showTotal, totalLabel, useFieldColors } = options;
    const valueFormat = fields[valueField]?.format;
    const valuePrefix = getValuePrefix(rows, valueField);
    const format = (value) => formatValue(value, valueFormat, valuePrefix);
    const palette = colorPalette.length ? colorPalette : FALLBACK_COLORS;
    const periods = getPeriods(rows, timeField);
    const lookup = sumByPeriodAndGroup({
        rows,
        timeField,
        groupField: componentField,
        metricFields: [valueField],
    });

    const components = getDistinctValues(rows, componentField).map(
        (component, index) => ({
            ...component,
            color:
                (useFieldColors &&
                    resolveValueColor(
                        context,
                        componentField,
                        component.raw,
                        index,
                    )) ||
                palette[index % palette.length],
            total: periods.reduce(
                (sum, period) =>
                    sum + (lookup(period.key, component.key)?.[0] ?? 0),
                0,
            ),
        }),
    );
    const visibleComponents = components.filter(
        (component) => !hiddenComponents.has(component.key),
    );
    const visibleTotal = visibleComponents.reduce(
        (sum, component) => sum + component.total,
        0,
    );

    const data = periods.map((period) => {
        const point = { label: period.label, [TOTAL_KEY]: 0 };
        components.forEach((component) => {
            const value = lookup(period.key, component.key)?.[0] ?? 0;
            point[component.key] = value;
            if (!hiddenComponents.has(component.key)) {
                point[TOTAL_KEY] += value;
            }
        });
        return point;
    });

    const ll = {
        text: readToken('--ll-text'),
        axisLine: readToken('--ll-axis-line'),
        grid: readToken('--ll-grid-line-bar'),
        ink: readToken('--ll-ink'),
    };
    const axisTick = { fill: ll.text, fontSize: 11.5, fontWeight: 500 };

    return (
        <div className="chart-root">
            {subtitle && <p className="chart-subtitle">{subtitle}</p>}
            <div className="composition-bar" aria-hidden="true">
                {visibleComponents.map((component) => (
                    <div
                        key={component.key}
                        className="composition-segment"
                        title={`${component.label}: ${format(component.total)}`}
                        style={{
                            flexGrow: visibleTotal
                                ? component.total / visibleTotal
                                : 1,
                            backgroundColor: component.color,
                        }}
                    />
                ))}
            </div>
            <SeriesChips
                label="Show components"
                items={components.map((component) => ({
                    ...component,
                    detail: format(component.total),
                }))}
                hiddenKeys={hiddenComponents}
                onToggle={(key) =>
                    setHiddenComponents((current) => toggleKey(current, key))
                }
                showEye
            />
            {showTotal && (
                <div className="legend-line">
                    <svg width="18" height="8" aria-hidden="true">
                        <line
                            x1="0"
                            y1="4"
                            x2="18"
                            y2="4"
                            stroke={ll.ink}
                            strokeWidth="2"
                        />
                    </svg>
                    {totalLabel}
                </div>
            )}
            <div className="chart-body">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                        data={data}
                        margin={{ top: 24, right: 8, bottom: 0, left: 0 }}
                    >
                        <CartesianGrid
                            vertical={false}
                            stroke={ll.grid}
                            strokeDasharray="3 3"
                        />
                        <XAxis
                            dataKey="label"
                            tick={axisTick}
                            tickLine={false}
                            axisLine={{ stroke: ll.axisLine }}
                            interval="preserveStartEnd"
                            minTickGap={16}
                        />
                        <YAxis
                            tick={axisTick}
                            tickLine={false}
                            axisLine={false}
                            width={52}
                            tickFormatter={format}
                        />
                        <Tooltip
                            wrapperClassName="ll-tooltip"
                            cursor={false}
                            formatter={(value, name) => [
                                format(value),
                                name === TOTAL_KEY
                                    ? totalLabel
                                    : (components.find(
                                          (component) => component.key === name,
                                      )?.label ?? name),
                            ]}
                        />
                        {visibleComponents.map((component) => (
                            <Bar
                                key={component.key}
                                dataKey={component.key}
                                name={component.key}
                                stackId="components"
                                fill={component.color}
                                maxBarSize={48}
                                isAnimationActive={false}
                            />
                        ))}
                        {showTotal && (
                            <Line
                                dataKey={TOTAL_KEY}
                                name={TOTAL_KEY}
                                type="linear"
                                stroke={ll.ink}
                                strokeWidth={1.5}
                                dot={{ r: 3, fill: '#fff', stroke: ll.ink }}
                                isAnimationActive={false}
                            >
                                <LabelList
                                    dataKey={TOTAL_KEY}
                                    position="top"
                                    offset={8}
                                    formatter={format}
                                    style={{
                                        fill: ll.ink,
                                        fontSize: 11,
                                        fontWeight: 600,
                                    }}
                                />
                            </Line>
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export default App;

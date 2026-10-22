import {
    resolveValueColor,
    useColorScheme,
    useVizContext,
} from '@lightdash/query-sdk';
import { useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    LabelList,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import './lightdash-library.css';
import './controls.css';
import {
    asFieldList,
    formatValue,
    getValuePrefix,
    getBreakdownOptions,
    getDistinctValues,
    getPeriods,
    readToken,
    sumByPeriodAndGroup,
} from './aggregate';
import { SegmentedControl, SeriesChips, toggleKey } from './controls';

const FALLBACK_COLORS = ['#3b2cc9', '#f08a4b', '#2a9d8f', '#8e86d9', '#e9c46a'];

function App() {
    const context = useVizContext();
    const { fieldMapping, fields, rows, options, colorPalette, ready } =
        context;
    useColorScheme();
    const [mode, setMode] = useState('overall');
    const [hiddenGroups, setHiddenGroups] = useState(() => new Set());

    if (!ready) return <div className="placeholder" />;

    const timeField = fieldMapping.time;
    const valueField = fieldMapping.value;
    const breakdownFields = asFieldList(fieldMapping.breakdowns);
    if (!timeField || !valueField) {
        return (
            <div className="placeholder">
                Map the Period and Value fields to see the chart.
            </div>
        );
    }
    if (rows.length === 0) {
        return <div className="placeholder">No results for these filters.</div>;
    }

    const groupField = breakdownFields.includes(mode) ? mode : null;
    const { subtitle, legendLabel, showLabels, useFieldColors } = options;
    const valueFormat = fields[valueField]?.format;
    const valuePrefix = getValuePrefix(rows, valueField);
    const format = (value) => formatValue(value, valueFormat, valuePrefix);
    const palette = colorPalette.length ? colorPalette : FALLBACK_COLORS;
    const periods = getPeriods(rows, timeField);
    const lookup = sumByPeriodAndGroup({
        rows,
        timeField,
        groupField,
        metricFields: [valueField],
    });

    const groups = groupField
        ? getDistinctValues(rows, groupField).map((group, index) => ({
              ...group,
              color:
                  (useFieldColors &&
                      resolveValueColor(
                          context,
                          groupField,
                          group.raw,
                          index,
                      )) ||
                  palette[index % palette.length],
          }))
        : [{ key: 'all', label: legendLabel, color: palette[0] }];
    const visibleGroups = groups.filter(
        (group) => !hiddenGroups.has(group.key),
    );

    const data = periods.map((period) => {
        const point = { label: period.label };
        groups.forEach((group) => {
            point[group.key] = lookup(period.key, group.key)?.[0] ?? 0;
        });
        return point;
    });
    const total = data.reduce(
        (sum, point) =>
            sum +
            visibleGroups.reduce((acc, group) => acc + point[group.key], 0),
        0,
    );

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
            {breakdownFields.length > 0 && (
                <div className="chart-toolbar">
                    <SegmentedControl
                        label="Group by"
                        options={getBreakdownOptions(context, breakdownFields)}
                        value={groupField ?? 'overall'}
                        onChange={(next) => {
                            setMode(next);
                            setHiddenGroups(new Set());
                        }}
                    />
                </div>
            )}
            {groupField ? (
                <SeriesChips
                    label="Show series"
                    items={groups}
                    hiddenKeys={hiddenGroups}
                    onToggle={(key) =>
                        setHiddenGroups((current) => toggleKey(current, key))
                    }
                />
            ) : (
                <div className="legend-line">
                    <span
                        className="chip-swatch"
                        style={{ backgroundColor: palette[0] }}
                    />
                    {legendLabel} · {format(total)} total
                </div>
            )}
            <div className="chart-body">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        barGap={2}
                        margin={{ top: 16, right: 16, bottom: 0, left: 0 }}
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
                            width={48}
                            tickFormatter={format}
                        />
                        <Tooltip
                            wrapperClassName="ll-tooltip"
                            cursor={false}
                            formatter={(value, name) => [
                                format(value),
                                groups.find((group) => group.key === name)
                                    ?.label ?? name,
                            ]}
                        />
                        {visibleGroups.map((group) => (
                            <Bar
                                key={group.key}
                                dataKey={group.key}
                                name={group.key}
                                fill={group.color}
                                radius={[3, 3, 0, 0]}
                                maxBarSize={56}
                                isAnimationActive={false}
                            >
                                {showLabels && (
                                    <LabelList
                                        dataKey={group.key}
                                        position="top"
                                        formatter={format}
                                        style={{
                                            fill: ll.ink,
                                            fontSize: 11,
                                            fontWeight: 500,
                                        }}
                                    />
                                )}
                            </Bar>
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export default App;

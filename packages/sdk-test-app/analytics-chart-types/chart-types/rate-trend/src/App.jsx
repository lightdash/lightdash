import {
    resolveValueColor,
    useColorScheme,
    useVizContext,
} from '@lightdash/query-sdk';
import { useState } from 'react';
import {
    CartesianGrid,
    LabelList,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import './lightdash-library.css';
import './controls.css';
import {
    asFieldList,
    getBreakdownOptions,
    getDistinctValues,
    getPeriods,
    readToken,
    sumByPeriodAndGroup,
} from './aggregate';
import { SegmentedControl, SeriesChips, toggleKey } from './controls';

const FALLBACK_COLORS = ['#3b2cc9', '#f08a4b', '#2a9d8f', '#8e86d9', '#e9c46a'];

const toRate = (sums) =>
    sums && sums[1] > 0 ? (sums[0] / sums[1]) * 100 : null;

const formatRate = (rate) => (rate === null ? '–' : `${Math.round(rate)}%`);

// Pads the visible rates and the target to the nearest 10 within 0-100%.
const getRateDomain = (rates, target) => {
    const values = [...rates.filter((rate) => rate !== null), target];
    const min = Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10);
    const max = Math.min(100, Math.ceil((Math.max(...values) + 5) / 10) * 10);
    return [min, max];
};

function buildSummary({ periods, overallRates, target, targetLabel }) {
    const latestIndex = overallRates.findLastIndex((rate) => rate !== null);
    if (latestIndex < 0) return null;
    const latest = overallRates[latestIndex];
    const compareIndex = Math.max(0, latestIndex - 12);
    const previous = overallRates[compareIndex];
    const parts = [`${formatRate(latest)} in ${periods[latestIndex].label}`];
    if (compareIndex !== latestIndex && previous !== null) {
        const direction = latest >= previous ? 'up' : 'down';
        parts[0] += `, ${direction} from ${formatRate(previous)} in ${periods[compareIndex].label}.`;
    } else {
        parts[0] += '.';
    }
    const gap = Math.round(latest - target);
    const position = gap < 0 ? 'below' : 'above';
    parts.push(
        `${Math.abs(gap)} pts ${position} the ${target}% ${targetLabel.toLowerCase()}.`,
    );
    return parts.join(' ');
}

function App() {
    const context = useVizContext();
    const { fieldMapping, rows, options, colorPalette, ready } = context;
    useColorScheme();
    const [mode, setMode] = useState('overall');
    const [hiddenGroups, setHiddenGroups] = useState(() => new Set());

    if (!ready) return <div className="placeholder" />;

    const timeField = fieldMapping.time;
    const numeratorField = fieldMapping.numerator;
    const denominatorField = fieldMapping.denominator;
    const breakdownFields = asFieldList(fieldMapping.breakdowns);
    if (!timeField || !numeratorField || !denominatorField) {
        return (
            <div className="placeholder">
                Map the Period, Numerator and Denominator fields to see the
                chart.
            </div>
        );
    }
    if (rows.length === 0) {
        return <div className="placeholder">No results for these filters.</div>;
    }

    const groupField = breakdownFields.includes(mode) ? mode : null;
    const { target, targetLabel, subtitle, showSummary, useFieldColors } =
        options;
    const palette = colorPalette.length ? colorPalette : FALLBACK_COLORS;
    const periods = getPeriods(rows, timeField);
    const lookup = sumByPeriodAndGroup({
        rows,
        timeField,
        groupField,
        metricFields: [numeratorField, denominatorField],
    });
    const overallLookup = sumByPeriodAndGroup({
        rows,
        timeField,
        groupField: null,
        metricFields: [numeratorField, denominatorField],
    });
    const overallRates = periods.map((period) =>
        toRate(overallLookup(period.key)),
    );

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
        : [{ key: 'all', label: 'Overall', color: palette[0] }];
    const visibleGroups = groups.filter(
        (group) => !hiddenGroups.has(group.key),
    );

    const data = periods.map((period) => {
        const point = { label: period.label };
        groups.forEach((group) => {
            point[group.key] = toRate(lookup(period.key, group.key));
        });
        return point;
    });

    const ll = {
        text: readToken('--ll-text'),
        axisLine: readToken('--ll-axis-line'),
        grid: readToken('--ll-grid-line'),
    };
    const axisTick = { fill: ll.text, fontSize: 11.5, fontWeight: 500 };
    const summary =
        showSummary &&
        buildSummary({ periods, overallRates, target, targetLabel });

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
            {groupField && (
                <SeriesChips
                    label="Show series"
                    items={groups}
                    hiddenKeys={hiddenGroups}
                    onToggle={(key) =>
                        setHiddenGroups((current) => toggleKey(current, key))
                    }
                />
            )}
            <div className="chart-body">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={data}
                        margin={{ top: 12, right: 48, bottom: 0, left: 0 }}
                    >
                        <CartesianGrid vertical={false} stroke={ll.grid} />
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
                            width={44}
                            domain={getRateDomain(
                                data.flatMap((point) =>
                                    visibleGroups.map(
                                        (group) => point[group.key],
                                    ),
                                ),
                                target,
                            )}
                            allowDecimals={false}
                            tickFormatter={(value) => `${Math.round(value)}%`}
                        />
                        <Tooltip
                            wrapperClassName="ll-tooltip"
                            formatter={(value, name) => [
                                formatRate(value),
                                groups.find((group) => group.key === name)
                                    ?.label ?? name,
                            ]}
                        />
                        <ReferenceLine
                            y={target}
                            stroke="#d9534f"
                            strokeDasharray="4 4"
                            label={{
                                value: `${targetLabel} ${target}%`,
                                position: 'insideTopLeft',
                                fill: '#d9534f',
                                fontSize: 11,
                                fontWeight: 600,
                            }}
                        />
                        {visibleGroups.map((group) => (
                            <Line
                                key={group.key}
                                dataKey={group.key}
                                name={group.key}
                                type="linear"
                                stroke={group.color}
                                strokeWidth={2}
                                dot={false}
                                connectNulls
                                isAnimationActive={false}
                            >
                                {!groupField && (
                                    <LabelList
                                        dataKey={group.key}
                                        content={({ x, y, index, value }) =>
                                            index === data.length - 1 ? (
                                                <text
                                                    x={x + 6}
                                                    y={y + 4}
                                                    fill={group.color}
                                                    fontSize={11}
                                                    fontWeight={600}
                                                >
                                                    {formatRate(value)}
                                                </text>
                                            ) : null
                                        }
                                    />
                                )}
                            </Line>
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
            {summary && <p className="chart-summary">{summary}</p>}
        </div>
    );
}

export default App;

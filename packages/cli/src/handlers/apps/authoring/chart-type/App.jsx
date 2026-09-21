import {
    getFormatted,
    getRaw,
    resolveValueColor,
    useColorScheme,
    useVizContext,
} from '@lightdash/query-sdk';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    LabelList,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
// The Lightdash Library theme: chrome tokens (--ll-*) matching Lightdash's
// built-in charts. See references/lightdash-library-theme.md for the contract.
import './lightdash-library.css';

// Host palette fallback, only used when the host resolves no palette.
const FALLBACK_COLORS = [
    '#5470c6',
    '#fc8452',
    '#91cc75',
    '#fac858',
    '#ee6666',
    '#73c0de',
    '#3ba272',
    '#9a60b4',
    '#ea7ccc',
];

// SVG attributes can't resolve var(), so read the theme tokens per render;
// useColorScheme() below re-renders this component when the host theme flips.
const token = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Starter custom chart type: a bar chart wired to the host the way every viz
// must be. It runs no query — Lightdash runs the query and pushes rows plus a
// mapping from the field names declared in lightdash-app.yml's vizSchema to
// the query's columns. Everything read here (`category`/`value` fields,
// `showLabels`/`maxBars` options) is declared there; keep the two in lockstep
// (see .claude/skills/reusable-visualization).
function App() {
    const context = useVizContext();
    const { fieldMapping, rows, options, colorPalette, ready } = context;
    useColorScheme();
    if (!ready) {
        return <div style={{ height: '100vh' }} />;
    }

    const catField = fieldMapping.category;
    const valField = fieldMapping.value;
    if (!catField || !valField) {
        return (
            <div
                style={{
                    height: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--ll-text)',
                    fontFamily: 'var(--ll-font)',
                }}
            >
                Map the Category and Value fields to see the chart.
            </div>
        );
    }

    const { showLabels, maxBars } = options;
    const palette = colorPalette.length ? colorPalette : FALLBACK_COLORS;
    const ll = {
        text: token('--ll-text'),
        axisLine: token('--ll-axis-line'),
        gridLine: token('--ll-grid-line-bar'),
        ink: token('--ll-ink'),
    };
    const axisTick = { fill: ll.text, fontSize: 11.5, fontWeight: 500 };
    const data = rows.slice(0, maxBars).map((row) => ({
        label: getFormatted(row, catField),
        category: getRaw(row, catField),
        value: Number(getRaw(row, valField) ?? 0),
    }));

    return (
        // The root fills the viewport, so ResponsiveContainer has a height to
        // measure. The canvas stays transparent — the host tile paints it.
        <div style={{ height: '100vh', fontFamily: 'var(--ll-font)' }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                    <CartesianGrid
                        vertical={false}
                        stroke={ll.gridLine}
                        strokeDasharray="3 3"
                    />
                    <XAxis
                        dataKey="label"
                        tick={axisTick}
                        tickLine={false}
                        axisLine={{ stroke: ll.axisLine }}
                        tickFormatter={(v) =>
                            v.length > 12 ? `${v.slice(0, 11)}…` : v
                        }
                    />
                    <YAxis
                        tick={axisTick}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v.toLocaleString()}
                    />
                    <Tooltip wrapperClassName="ll-tooltip" cursor={false} />
                    <Bar dataKey="value">
                        {data.map((d, i) => (
                            <Cell
                                key={`${d.label}-${i}`}
                                fill={
                                    resolveValueColor(
                                        context,
                                        catField,
                                        d.category,
                                        i,
                                    ) ?? palette[i % palette.length]
                                }
                            />
                        ))}
                        {showLabels && (
                            <LabelList
                                dataKey="value"
                                position="top"
                                style={{
                                    fill: ll.ink,
                                    fontSize: 11,
                                    fontWeight: 500,
                                }}
                            />
                        )}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

export default App;

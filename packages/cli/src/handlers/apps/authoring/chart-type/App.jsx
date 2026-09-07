import {
    getFormatted,
    getRaw,
    resolveValueColor,
    useVizContext,
} from '@lightdash/query-sdk';
import {
    Bar,
    BarChart,
    Cell,
    LabelList,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

// Starter custom chart type: a bar chart wired to the host the way every viz
// must be. It runs no query — Lightdash runs the query and pushes rows plus a
// mapping from the field names declared in lightdash-app.yml's vizSchema to
// the query's columns. Everything read here (`category`/`value` fields,
// `showLabels`/`maxBars` options) is declared there; keep the two in lockstep
// (see .claude/skills/reusable-visualization).
function App() {
    const context = useVizContext();
    const { fieldMapping, rows, options, ready } = context;
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
                }}
            >
                Map the Category and Value fields to see the chart.
            </div>
        );
    }

    const { showLabels, maxBars } = options;
    const fallbackColors = ['#7162FF', '#1A1B1E'];
    const data = rows.slice(0, maxBars).map((row) => ({
        label: getFormatted(row, catField),
        category: getRaw(row, catField),
        value: Number(getRaw(row, valField) ?? 0),
    }));

    return (
        // The root fills the viewport, so ResponsiveContainer has a height to
        // measure.
        <div style={{ height: '100vh' }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                    <XAxis
                        dataKey="label"
                        tickFormatter={(v) =>
                            v.length > 12 ? `${v.slice(0, 11)}…` : v
                        }
                    />
                    <YAxis tickFormatter={(v) => v.toLocaleString()} />
                    <Tooltip />
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
                                    ) ??
                                    fallbackColors[i % fallbackColors.length]
                                }
                            />
                        ))}
                        {showLabels && (
                            <LabelList dataKey="value" position="top" />
                        )}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

export default App;

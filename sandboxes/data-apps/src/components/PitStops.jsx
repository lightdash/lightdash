import { createClient, useLightdash } from '@lightdash/query-sdk';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import { getTeamColor } from '@/lib/colors';
import { LoadingState, ErrorState } from './LoadingState';

const lightdash = createClient();

const pitStopQuery = lightdash
    .model('fct_pit_stop_analysis')
    .dimensions(['team'])
    .metrics(['avg_pit_stop_seconds', 'fastest_pit_stop_seconds', 'pit_stop_count'])
    .sorts([{ field: 'avg_pit_stop_seconds', direction: 'asc' }])
    .limit(12);

function CustomTooltip({ active, payload }) {
    if (!active || !payload || payload.length === 0) return null;
    const d = payload[0].payload;

    return (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
            <p className="mb-1 text-sm font-semibold text-zinc-200">{d.team}</p>
            <div className="space-y-0.5 text-xs text-zinc-400">
                <p>Avg stop: <span className="font-mono text-zinc-200">{Number(d.avg_pit_stop_seconds).toFixed(2)}s</span></p>
                <p>Fastest: <span className="font-mono text-emerald-400">{Number(d.fastest_pit_stop_seconds).toFixed(2)}s</span></p>
                <p>Total stops: <span className="font-mono text-zinc-200">{d.pit_stop_count}</span></p>
            </div>
        </div>
    );
}

export function PitStops() {
    const { data, loading, error } = useLightdash(pitStopQuery);

    if (loading) return <LoadingState message="Loading pit stop data..." />;
    if (error) return <ErrorState error={error} />;
    if (!data || data.length === 0) return null;

    const shortName = (name) => {
        const map = {
            'Mercedes-AMG Petronas': 'Mercedes',
            'Red Bull Racing': 'Red Bull',
            'Scuderia Ferrari': 'Ferrari',
            'Kick Sauber': 'Sauber',
        };
        return map[name] || name;
    };

    const chartData = data.map((row) => ({
        ...row,
        avg_pit_stop_seconds: Number(row.avg_pit_stop_seconds),
        fastest_pit_stop_seconds: Number(row.fastest_pit_stop_seconds),
        shortName: shortName(String(row.team)),
    }));

    return (
        <Card className="border-zinc-800 bg-zinc-900/80">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg text-zinc-100">
                    Pit Stop Performance
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={360}>
                    <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                        <XAxis
                            type="number"
                            stroke="#71717a"
                            tick={{ fontSize: 12 }}
                            domain={['dataMin - 1', 'dataMax + 1']}
                            label={{ value: 'Seconds', position: 'insideBottom', offset: -2, fill: '#71717a', fontSize: 12 }}
                        />
                        <YAxis
                            dataKey="shortName"
                            type="category"
                            width={90}
                            stroke="#71717a"
                            tick={{ fontSize: 12 }}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#27272a' }} />
                        <Bar dataKey="avg_pit_stop_seconds" radius={[0, 4, 4, 0]} barSize={24} name="Avg Pit Stop">
                            {chartData.map((entry) => (
                                <Cell
                                    key={entry.team}
                                    fill={getTeamColor(String(entry.team))}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}

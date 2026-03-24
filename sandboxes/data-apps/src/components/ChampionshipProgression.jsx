import { createClient, useLightdash } from '@lightdash/query-sdk';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import { getDriverColor } from '@/lib/colors';
import { LoadingState, ErrorState } from './LoadingState';

const lightdash = createClient();

const progressionQuery = lightdash
    .model('fct_championship_progression')
    .dimensions(['round', 'driver_name', 'cumulative_points', 'race_name'])
    .sorts([{ field: 'round', direction: 'asc' }])
    .limit(500);

function CustomTooltip({ active, payload, label }) {
    if (!active || !payload || payload.length === 0) return null;

    const raceName = payload[0]?.payload?._raceName || `Round ${label}`;
    const sorted = [...payload].sort((a, b) => Number(b.value) - Number(a.value));

    return (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
            <p className="mb-2 text-xs font-semibold text-zinc-300">{raceName}</p>
            <div className="space-y-1">
                {sorted.slice(0, 10).map((entry) => (
                    <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
                        <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-zinc-400">{entry.dataKey}</span>
                        <span className="ml-auto font-mono text-zinc-200">{entry.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ChampionshipProgression() {
    const { data, loading, error } = useLightdash(progressionQuery);

    if (loading) return <LoadingState message="Loading championship data..." />;
    if (error) return <ErrorState error={error} />;
    if (!data || data.length === 0) return null;

    // Pivot: one row per round, one column per driver
    const drivers = [...new Set(data.map((r) => String(r.driver_name)))];
    const roundMap = new Map();

    for (const row of data) {
        const round = Number(row.round);
        if (!roundMap.has(round)) {
            roundMap.set(round, { round, _raceName: String(row.race_name) });
        }
        roundMap.get(round)[String(row.driver_name)] = Number(row.cumulative_points);
    }

    const chartData = [...roundMap.values()].sort((a, b) => a.round - b.round);

    // Only show top 10 drivers (by final cumulative points) to avoid clutter
    const lastRound = chartData[chartData.length - 1];
    const topDrivers = drivers
        .map((d) => ({ name: d, pts: lastRound?.[d] || 0 }))
        .sort((a, b) => b.pts - a.pts)
        .slice(0, 10)
        .map((d) => d.name);

    return (
        <Card className="border-zinc-800 bg-zinc-900/80">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg text-zinc-100">
                    Championship Progression
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis
                            dataKey="round"
                            stroke="#71717a"
                            tick={{ fontSize: 12 }}
                            label={{ value: 'Round', position: 'insideBottom', offset: -2, fill: '#71717a', fontSize: 12 }}
                        />
                        <YAxis
                            stroke="#71717a"
                            tick={{ fontSize: 12 }}
                            label={{ value: 'Points', angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 12 }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                            wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }}
                            iconType="circle"
                            iconSize={8}
                        />
                        {topDrivers.map((driver) => (
                            <Line
                                key={driver}
                                type="monotone"
                                dataKey={driver}
                                stroke={getDriverColor(driver)}
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4 }}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}

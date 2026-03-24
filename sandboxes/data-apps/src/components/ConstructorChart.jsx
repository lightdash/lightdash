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

const constructorQuery = lightdash
    .model('fct_constructor_standings')
    .dimensions([
        'constructor_name',
        'championship_position',
        'total_points',
        'wins',
        'podiums',
    ])
    .sorts([{ field: 'total_points', direction: 'desc' }])
    .limit(12);

function CustomTooltip({ active, payload }) {
    if (!active || !payload || payload.length === 0) return null;
    const d = payload[0].payload;

    return (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
            <p className="mb-1 text-sm font-semibold text-zinc-200">{d.constructor_name}</p>
            <div className="space-y-0.5 text-xs text-zinc-400">
                <p>Points: <span className="font-mono text-zinc-200">{d.total_points}</span></p>
                <p>Wins: <span className="font-mono text-zinc-200">{d.wins}</span></p>
                <p>Podiums: <span className="font-mono text-zinc-200">{d.podiums}</span></p>
            </div>
        </div>
    );
}

export function ConstructorChart() {
    const { data, loading, error } = useLightdash(constructorQuery);

    if (loading) return <LoadingState message="Loading constructor data..." />;
    if (error) return <ErrorState error={error} />;
    if (!data || data.length === 0) return null;

    // Shorten long team names for axis labels
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
        total_points: Number(row.total_points),
        shortName: shortName(String(row.constructor_name)),
    }));

    return (
        <Card className="border-zinc-800 bg-zinc-900/80">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg text-zinc-100">
                    Constructor Championship
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
                        />
                        <YAxis
                            dataKey="shortName"
                            type="category"
                            width={90}
                            stroke="#71717a"
                            tick={{ fontSize: 12 }}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#27272a' }} />
                        <Bar dataKey="total_points" radius={[0, 4, 4, 0]} barSize={24}>
                            {chartData.map((entry) => (
                                <Cell
                                    key={entry.constructor_name}
                                    fill={getTeamColor(String(entry.constructor_name))}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}

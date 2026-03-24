import { createClient, useLightdash } from '@lightdash/query-sdk';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy, Flag, Users, Zap } from 'lucide-react';
import { LoadingState, ErrorState } from './LoadingState';

const lightdash = createClient();

const standingsQuery = lightdash
    .model('dim_driver_standings')
    .dimensions([
        'championship_position',
        'driver_name',
        'team',
        'total_points',
        'wins',
        'races_entered',
    ])
    .sorts([{ field: 'championship_position', direction: 'asc' }])
    .limit(22);

export function KpiCards() {
    const { data, loading, error } = useLightdash(standingsQuery);

    if (loading) return <LoadingState message="Loading standings..." />;
    if (error) return <ErrorState error={error} />;
    if (!data || data.length === 0) return null;

    const leader = data[0];
    const totalRaces = Number(leader.races_entered);
    const totalWins = data.reduce((sum, d) => sum + Number(d.wins), 0);
    const totalDrivers = data.length;
    const leaderGap = Number(leader.total_points) - Number(data[1]?.total_points || 0);

    const kpis = [
        {
            label: 'Championship Leader',
            value: leader.driver_name,
            sub: `${leader.total_points} pts`,
            icon: Trophy,
            accent: 'text-yellow-400',
        },
        {
            label: 'Races Completed',
            value: totalRaces,
            sub: `${totalWins} wins so far`,
            icon: Flag,
            accent: 'text-red-400',
        },
        {
            label: 'Leader Gap',
            value: `+${leaderGap}`,
            sub: `pts over P2`,
            icon: Zap,
            accent: 'text-emerald-400',
        },
        {
            label: 'Drivers',
            value: totalDrivers,
            sub: '10 teams',
            icon: Users,
            accent: 'text-blue-400',
        },
    ];

    return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {kpis.map((kpi) => (
                <Card key={kpi.label} className="border-zinc-800 bg-zinc-900/80">
                    <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                                    {kpi.label}
                                </p>
                                <p className="text-2xl font-bold text-zinc-100">{kpi.value}</p>
                                <p className="text-xs text-zinc-500">{kpi.sub}</p>
                            </div>
                            <kpi.icon className={`h-5 w-5 ${kpi.accent}`} />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

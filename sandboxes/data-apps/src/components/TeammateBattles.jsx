import { createClient, useLightdash } from '@lightdash/query-sdk';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTeamColor } from '@/lib/colors';
import { LoadingState, ErrorState } from './LoadingState';

const lightdash = createClient();

const battlesQuery = lightdash
    .model('fct_teammate_battles')
    .dimensions([
        'constructor_name',
        'driver_a',
        'driver_b',
        'race_wins_a',
        'race_wins_b',
        'quali_wins_a',
        'quali_wins_b',
        'total_races',
    ])
    .sorts([{ field: 'constructor_name', direction: 'asc' }])
    .limit(12);

function BattleBar({ leftVal, rightVal, color }) {
    const total = leftVal + rightVal;
    if (total === 0) return <div className="h-2 w-full rounded-full bg-zinc-800" />;
    const leftPct = (leftVal / total) * 100;

    return (
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
                className="absolute left-0 top-0 h-full rounded-full transition-all"
                style={{ width: `${leftPct}%`, backgroundColor: color, opacity: 0.9 }}
            />
            <div
                className="absolute right-0 top-0 h-full rounded-full transition-all"
                style={{ width: `${100 - leftPct}%`, backgroundColor: color, opacity: 0.4 }}
            />
        </div>
    );
}

function BattleRow({ row }) {
    const color = getTeamColor(String(row.constructor_name));
    const raceA = Number(row.race_wins_a);
    const raceB = Number(row.race_wins_b);
    const qualiA = Number(row.quali_wins_a);
    const qualiB = Number(row.quali_wins_b);

    return (
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    {row.constructor_name}
                </span>
                <span className="text-xs text-zinc-600">{row.total_races} races</span>
            </div>

            {/* Race head-to-head */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-300">{row.driver_a}</span>
                    <span className="text-zinc-500">Race H2H</span>
                    <span className="font-medium text-zinc-300">{row.driver_b}</span>
                </div>
                <BattleBar leftVal={raceA} rightVal={raceB} color={color} />
                <div className="flex justify-between text-xs font-mono text-zinc-500">
                    <span>{raceA}</span>
                    <span>{raceB}</span>
                </div>
            </div>

            {/* Qualifying head-to-head */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-300">{row.driver_a}</span>
                    <span className="text-zinc-500">Quali H2H</span>
                    <span className="font-medium text-zinc-300">{row.driver_b}</span>
                </div>
                <BattleBar leftVal={qualiA} rightVal={qualiB} color={color} />
                <div className="flex justify-between text-xs font-mono text-zinc-500">
                    <span>{qualiA}</span>
                    <span>{qualiB}</span>
                </div>
            </div>
        </div>
    );
}

export function TeammateBattles() {
    const { data, loading, error } = useLightdash(battlesQuery);

    if (loading) return <LoadingState message="Loading teammate battles..." />;
    if (error) return <ErrorState error={error} />;
    if (!data || data.length === 0) return null;

    return (
        <Card className="border-zinc-800 bg-zinc-900/80">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg text-zinc-100">
                    Teammate Battles
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                    {data.map((row) => (
                        <BattleRow key={row.constructor_name} row={row} />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

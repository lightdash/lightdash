import { createClient, useLightdash } from '@lightdash/query-sdk';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getTeamColor } from '@/lib/colors';
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
        'podiums',
        'dnfs',
        'avg_finish_position',
        'avg_points_per_race',
    ])
    .sorts([{ field: 'championship_position', direction: 'asc' }])
    .limit(22);

function PositionBadge({ position }) {
    const p = Number(position);
    const colors = {
        1: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
        2: 'bg-zinc-400/20 text-zinc-300 border-zinc-400/30',
        3: 'bg-amber-700/20 text-amber-400 border-amber-700/30',
    };
    const cls = colors[p] || 'bg-zinc-800 text-zinc-400 border-zinc-700';

    return (
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${cls}`}>
            {p}
        </span>
    );
}

export function DriverStandings() {
    const { data, loading, error } = useLightdash(standingsQuery);

    if (loading) return <LoadingState message="Loading driver standings..." />;
    if (error) return <ErrorState error={error} />;
    if (!data || data.length === 0) return null;

    return (
        <Card className="border-zinc-800 bg-zinc-900/80">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg text-zinc-100">
                    Driver Standings
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow className="border-zinc-800 hover:bg-transparent">
                            <TableHead className="w-14 text-zinc-500">Pos</TableHead>
                            <TableHead className="text-zinc-500">Driver</TableHead>
                            <TableHead className="text-zinc-500">Team</TableHead>
                            <TableHead className="text-right text-zinc-500">Pts</TableHead>
                            <TableHead className="text-right text-zinc-500">Wins</TableHead>
                            <TableHead className="text-right text-zinc-500">Podiums</TableHead>
                            <TableHead className="text-right text-zinc-500">DNFs</TableHead>
                            <TableHead className="text-right text-zinc-500">Avg Finish</TableHead>
                            <TableHead className="text-right text-zinc-500">Pts/Race</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((row) => (
                            <TableRow
                                key={row.driver_name}
                                className="border-zinc-800/50 hover:bg-zinc-800/50"
                            >
                                <TableCell>
                                    <PositionBadge position={row.championship_position} />
                                </TableCell>
                                <TableCell className="font-medium text-zinc-200">
                                    {row.driver_name}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="h-3 w-1 rounded-full"
                                            style={{ backgroundColor: getTeamColor(String(row.team)) }}
                                        />
                                        <span className="text-sm text-zinc-400">{row.team}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-zinc-100">
                                    {row.total_points}
                                </TableCell>
                                <TableCell className="text-right font-mono text-zinc-300">
                                    {row.wins}
                                </TableCell>
                                <TableCell className="text-right font-mono text-zinc-300">
                                    {row.podiums}
                                </TableCell>
                                <TableCell className="text-right font-mono text-zinc-400">
                                    {row.dnfs}
                                </TableCell>
                                <TableCell className="text-right font-mono text-zinc-400">
                                    {Number(row.avg_finish_position).toFixed(1)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-zinc-400">
                                    {Number(row.avg_points_per_race).toFixed(1)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

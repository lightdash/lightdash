import { useLightdash } from '@lightdash/query-sdk';
import { fmt } from '../format';
import { lightdash } from '../lightdash';

const winnerQuery = lightdash
    .model('fct_race_results')
    .dimensions(['driver_name'])
    .metrics(['total_wins', 'total_podiums', 'average_finish_position'])
    .filters([{ field: 'season', operator: 'equals', value: 2025 }])
    .sorts([{ field: 'total_wins', direction: 'desc' }])
    .limit(8);

export function TopPerformers() {
    const { data, loading, error } = useLightdash(winnerQuery);

    if (loading) return <div className="card loading">Loading...</div>;
    if (error) return <div className="card error">{error.message}</div>;

    return (
        <div className="card">
            <h2>Race Winners</h2>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Driver</th>
                        <th className="num">Wins</th>
                        <th className="num">Podiums</th>
                        <th className="num">Avg Finish</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, i) => (
                        <tr key={i}>
                            <td className="driver-name">
                                {String(row.driver_name)}
                            </td>
                            <td className="num">{fmt(row.total_wins)}</td>
                            <td className="num">{fmt(row.total_podiums)}</td>
                            <td className="num">
                                {fmt(row.average_finish_position, 1)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

import { query, useLightdash } from '@lightdash/query-sdk';

const standingsQuery = query('fct_race_results')
    .dimensions(['driver_name', 'constructor_name'])
    .metrics([
        'total_points',
        'total_wins',
        'total_podiums',
        'average_finish_position',
        'average_grid_position',
    ])
    .filters([{ field: 'season', operator: 'equals', value: 2025 }])
    .sorts([{ field: 'total_points', direction: 'desc' }])
    .limit(20);

export function DriverStandings() {
    const { data, format, loading, error } = useLightdash(standingsQuery);

    if (loading) return <div className="card loading">Loading...</div>;
    if (error) return <div className="card error">{error.message}</div>;

    return (
        <div className="card">
            <h2>Driver Championship</h2>
            <table className="data-table">
                <thead>
                    <tr>
                        <th></th>
                        <th>Driver</th>
                        <th>Team</th>
                        <th className="num">Pts</th>
                        <th className="num">Wins</th>
                        <th className="num">Podiums</th>
                        <th className="num">Avg Grid</th>
                        <th className="num">Avg Finish</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, i) => (
                        <tr key={i}>
                            <td className="pos">{i + 1}</td>
                            <td className="driver-name">
                                {String(row.driver_name)}
                            </td>
                            <td className="team-name">
                                {String(row.constructor_name)}
                            </td>
                            <td className="num">{format(row, 'total_points')}</td>
                            <td className="num">{format(row, 'total_wins')}</td>
                            <td className="num">{format(row, 'total_podiums')}</td>
                            <td className="num">
                                {format(row, 'average_grid_position')}
                            </td>
                            <td className="num">
                                {format(row, 'average_finish_position')}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

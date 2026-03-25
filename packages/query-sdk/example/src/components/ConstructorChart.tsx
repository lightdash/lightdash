import { query, useLightdash } from '@lightdash/query-sdk';

const TEAM_COLORS: Record<string, string> = {
    McLaren: '#FF8700',
    'Red Bull Racing': '#3671C6',
    'Scuderia Ferrari': '#E8002D',
    'Mercedes-AMG Petronas': '#27F4D2',
    'Aston Martin': '#229971',
    Alpine: '#0093CC',
    Haas: '#B6BABD',
    'Racing Bulls': '#6692FF',
    Williams: '#64C4FF',
    'Kick Sauber': '#52E252',
    Cadillac: '#FFD700',
};

const chartQuery = query('fct_race_results')
    .dimensions(['constructor_name'])
    .metrics(['total_points'])
    .filters([{ field: 'season', operator: 'equals', value: 2025 }])
    .sorts([{ field: 'total_points', direction: 'desc' }])
    .limit(10);

export function ConstructorChart() {
    const { data, format, loading, error } = useLightdash(chartQuery);

    if (loading) return <div className="card loading">Loading...</div>;
    if (error) return <div className="card error">{error.message}</div>;

    const maxValue = Math.max(
        ...data.map((r) => (r.total_points as number) ?? 0),
        1,
    );

    return (
        <div className="card">
            <h2>Constructor Championship</h2>
            <div className="bar-chart">
                {data.map((row, i) => {
                    const name = String(row.constructor_name);
                    const value = (row.total_points as number) ?? 0;
                    const pct = (value / maxValue) * 100;
                    const color = TEAM_COLORS[name] ?? '#666';
                    return (
                        <div key={i} className="bar-row">
                            <span className="bar-label">{name}</span>
                            <div className="bar-track">
                                <div
                                    className="bar-fill"
                                    style={{
                                        width: `${Math.max(pct, 6)}%`,
                                        background: color,
                                    }}
                                >
                                    {format(row, 'total_points')}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

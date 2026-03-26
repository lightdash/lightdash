import { query, useLightdash } from '@lightdash/query-sdk';

const kpiQuery = query('fct_race_results')
    .metrics(['race_count', 'total_points', 'total_wins', 'total_podiums'])
    .filters([{ field: 'season', operator: 'equals', value: 2025 }])
    .limit(1);

export function KpiCards() {
    const { data, columns, format, loading, error } = useLightdash(kpiQuery);

    if (loading) return <div className="loading">Loading...</div>;
    if (error) return <div className="error">{error.message}</div>;

    const row = data[0];
    if (!row) return null;

    return (
        <div className="kpi-row">
            {columns.map((col) => (
                <div key={col.name} className="kpi-card">
                    <div className="label">{col.label}</div>
                    <div className="value">{format(row, col.name)}</div>
                </div>
            ))}
        </div>
    );
}

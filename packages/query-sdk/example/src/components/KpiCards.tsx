import { useLightdash } from '@lightdash/query-sdk';
import { lightdash } from '../lightdash';

const kpiQuery = lightdash
    .model('fct_race_results')
    .metrics(['race_count', 'total_points', 'total_wins', 'total_podiums'])
    .filters([{ field: 'season', operator: 'equals', value: 2025 }])
    .limit(1);

const LABELS: Record<string, string> = {
    race_count: 'Race Entries',
    total_points: 'Total Points',
    total_wins: 'Wins',
    total_podiums: 'Podiums',
};

export function KpiCards() {
    const { data, loading, error } = useLightdash(kpiQuery);

    if (loading) return <div className="loading">Loading...</div>;
    if (error) return <div className="error">{error.message}</div>;

    const row = data[0];
    if (!row) return null;

    const fields = [
        'race_count',
        'total_points',
        'total_wins',
        'total_podiums',
    ];

    return (
        <div className="kpi-row">
            {fields.map((field) => (
                <div key={field} className="kpi-card">
                    <div className="label">{LABELS[field]}</div>
                    <div className="value">{String(row[field] ?? '-')}</div>
                </div>
            ))}
        </div>
    );
}

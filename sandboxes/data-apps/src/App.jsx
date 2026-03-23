import { createClient, useLightdash } from '@lightdash/query-sdk';

const lightdash = createClient();

const standingsQuery = lightdash
    .model('fct_race_results')
    .dimensions(['driver_name', 'constructor_name'])
    .metrics(['total_points', 'total_wins', 'total_podiums'])
    .filters([{ field: 'season', operator: 'equals', value: 2025 }])
    .sorts([{ field: 'total_points', direction: 'desc' }])
    .limit(10);

function App() {
    const { data, loading, error } = useLightdash(standingsQuery);

    if (loading) return <p className="p-8 text-gray-500">Loading...</p>;
    if (error) return <p className="p-8 text-red-500">{error.message}</p>;

    return (
        <div className="max-w-3xl mx-auto p-8">
            <h1 className="text-2xl font-bold mb-6">
                F1 2025 — Driver Championship
            </h1>
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left text-gray-500">
                        <th className="py-2 w-8">#</th>
                        <th className="py-2">Driver</th>
                        <th className="py-2">Team</th>
                        <th className="py-2 text-right">Pts</th>
                        <th className="py-2 text-right">Wins</th>
                        <th className="py-2 text-right">Podiums</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, i) => (
                        <tr key={i} className="border-b">
                            <td className="py-2 text-gray-400">{i + 1}</td>
                            <td className="py-2 font-semibold">
                                {String(row.driver_name)}
                            </td>
                            <td className="py-2 text-gray-500">
                                {String(row.constructor_name)}
                            </td>
                            <td className="py-2 text-right font-mono">
                                {String(row.total_points)}
                            </td>
                            <td className="py-2 text-right">
                                {String(row.total_wins)}
                            </td>
                            <td className="py-2 text-right">
                                {String(row.total_podiums)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default App;

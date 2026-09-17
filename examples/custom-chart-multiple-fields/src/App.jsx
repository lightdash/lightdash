import { getFormatted, getRaw, useVizContext } from '@lightdash/query-sdk';
import React from 'react';
import './chart.css';

export default function App() {
    const context = useVizContext();
    const { fieldMapping, rows, ready, options, underlyingData } = context;
    const groups = Array.isArray(fieldMapping.groups)
        ? fieldMapping.groups
        : [];
    const values = Array.isArray(fieldMapping.values)
        ? fieldMapping.values
        : [];
    if (!ready || !groups.length || !values.length) {
        return (
            <main>Select grouping fields and measures to see the chart.</main>
        );
    }
    const maxima = Object.fromEntries(
        values.map((id) => [
            id,
            Math.max(
                1,
                ...rows.map((row) => Math.abs(Number(getRaw(row, id)) || 0)),
            ),
        ]),
    );
    return (
        <main>
            <header>
                <p className="eyebrow">Ordered field inputs</p>
                <h1>{options.title || 'Measures by group'}</h1>
                <p>
                    {groups.length} grouping fields · {values.length} measures ·{' '}
                    {rows.length} rows
                </p>
            </header>
            <table>
                <thead>
                    <tr>
                        {[...groups, ...values].map((id, index) => (
                            <th key={id}>
                                <span className="position">{index + 1}</span>
                                {id
                                    .replace(/^orders_/, '')
                                    .replaceAll('_', ' ')}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.slice(0, 20).map((row, index) => (
                        <tr key={index}>
                            {groups.map((id) => (
                                <td key={id}>{getFormatted(row, id)}</td>
                            ))}
                            {values.map((id) => (
                                <td key={id}>
                                    <button
                                        className="measure"
                                        disabled={!underlyingData.enabled}
                                        onClick={() =>
                                            underlyingData
                                                .open({
                                                    row,
                                                    metric: 'values',
                                                    fieldId: id,
                                                })
                                                .catch(() => {})
                                        }
                                    >
                                        <span>{getFormatted(row, id)}</span>
                                        <meter
                                            min="0"
                                            max={maxima[id]}
                                            value={Math.abs(
                                                Number(getRaw(row, id)) || 0,
                                            )}
                                        />
                                    </button>
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            <footer>
                Columns follow the selected field order. Reorder either input to
                compare.
            </footer>
        </main>
    );
}

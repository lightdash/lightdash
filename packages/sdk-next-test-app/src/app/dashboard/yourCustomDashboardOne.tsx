'use client';

import '@lightdash/sdk/sdk.css';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { SavedChart } from '../../../../common/src';

const LightdashDashboard = dynamic(
    () => import('@lightdash/sdk').then((Lightdash) => Lightdash.Dashboard),
    {
        ssr: false,
        // you can add a your custom loading component here
        loading: () => <div>Loading Dashboard...</div>,
    },
);

const LightdashExplore = dynamic(
    () => import('@lightdash/sdk').then((Lightdash) => Lightdash.Explore),
    {
        ssr: false,
        loading: () => <div>Loading Explore...</div>,
    },
);

export default function YourCustomDashboard() {
    const [chart, setChart] = useState<SavedChart>();
    const instanceUrl = '<your-instance-url>';
    const token = '<your-token>';

    return (
        <>
            <h3>sub page where your dashboard will be rendered</h3>

            <div
                style={{
                    marginTop: 30,
                    width: '800px',
                    height: '600px',
                    position: 'relative',
                    overflow: 'auto',
                }}
            >
                {chart && (
                    <button onClick={() => setChart(undefined)}>
                        Go back to dashboard
                    </button>
                )}
                {chart ? (
                    <LightdashExplore
                        instanceUrl={instanceUrl}
                        token={token}
                        exploreId={chart?.tableName}
                        savedChart={chart}
                    />
                ) : (
                    <LightdashDashboard
                        instanceUrl={instanceUrl}
                        token={token}
                        onExplore={({ chart }: any) => setChart(chart)}
                    />
                )}
            </div>
        </>
    );
}

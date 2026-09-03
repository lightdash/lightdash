'use client';

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
    // Configure via NEXT_PUBLIC_LIGHTDASH_EMBED_URL in .env.local:
    // https://<instance>/embed/<projectUuid>#<token>
    const embedUrl = new URL(
        process.env.NEXT_PUBLIC_LIGHTDASH_EMBED_URL ??
            'http://localhost:3000/embed/x#missing-token',
    );
    const instanceUrl = embedUrl.origin;
    const token = embedUrl.hash.slice(1);

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

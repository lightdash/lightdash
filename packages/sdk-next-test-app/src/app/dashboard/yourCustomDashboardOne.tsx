'use client';

import dynamic from 'next/dynamic';

const LightdashDashboard = dynamic(
    () => import('@lightdash/sdk').then((Lightdash) => Lightdash.Dashboard),
    {
        ssr: false,
        // you can add a your custom loading component here
        loading: () => <div>Loading...</div>,
    },
);

export default function YourCustomDashboard() {
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
                <LightdashDashboard
                    instanceUrl="<your-instance-url>"
                    token="<your-token>"
                />
            </div>
        </>
    );
}

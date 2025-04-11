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
                    instanceUrl="http://localhost:3000/"
                    token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250ZW50Ijp7InR5cGUiOiJkYXNoYm9hcmQiLCJwcm9qZWN0VXVpZCI6IjM2NzViNjllLTgzMjQtNDExMC1iZGNhLTA1OTAzMWFhOGRhMyIsImRhc2hib2FyZFV1aWQiOiJhODQzYzQ5MS00ZmJhLTQzMzItYWFkOS0zYjY0ZjkzMmVjNTgiLCJkYXNoYm9hcmRGaWx0ZXJzSW50ZXJhY3Rpdml0eSI6eyJlbmFibGVkIjoibm9uZSJ9LCJjYW5FeHBvcnRDc3YiOmZhbHNlLCJjYW5FeHBvcnRJbWFnZXMiOmZhbHNlLCJpc1ByZXZpZXciOmZhbHNlLCJjYW5EYXRlWm9vbSI6ZmFsc2UsImNhbkV4cG9ydFBhZ2VQZGYiOmZhbHNlfSwidXNlckF0dHJpYnV0ZXMiOnsiIjoiIn0sInVzZXIiOnsiZW1haWwiOiJkZW1vQGxpZ2h0ZGFzaC5jb20ifSwiaWF0IjoxNzQ0MzMyMDY5LCJleHAiOjE3NzU4ODk2Njl9.peiD6nQH2_RGklSfePQJl3uapTzNQRkzsJ-GASiYkV0"
                />
            </div>
        </>
    );
}

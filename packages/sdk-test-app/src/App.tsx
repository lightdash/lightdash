import Lightdash from '@lightdash/sdk';
import { useEffect, useState } from 'react';

// NOTE: add an embed url here for persistence
const EMBED_URL = '';

interface EmbedUrlInputProps {
    draftUrl: string;
    onDraftUrlChange: (value: string) => void;
    onSubmit: () => void;
    onClear: () => void;
}

const EmbedUrlInput: React.FC<EmbedUrlInputProps> = ({
    draftUrl,
    onDraftUrlChange,
    onSubmit,
    onClear,
}) => {
    return (
        <div style={{ display: 'flex', gap: '8px' }}>
            <input
                type="text"
                value={draftUrl}
                onChange={(e) => onDraftUrlChange(e.target.value)}
                style={{ flexGrow: 1 }}
            />
            <button onClick={onSubmit}>Set Embed URL</button>
            <button onClick={onClear}>Clear</button>
        </div>
    );
};

function App() {
    const [lightdashUrl, setLightdashUrl] = useState<string | null>(null);
    const [lightdashToken, setLightdashToken] = useState<string | null>(null);
    const [embedUrl, setEmbedUrl] = useState<string>(EMBED_URL);
    const [draftUrl, setDraftUrl] = useState<string>(EMBED_URL);
    const containerStyle = {
        fontFamily: 'Arial, Helvetica, sans-serif',
        background: 'linear-gradient(135deg, #f0f2f5 0%, #e9eff5 100%)',
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        padding: '20px',
    };

    const contentStyle = {
        backgroundColor: '#ffffff',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
        maxWidth: '800px',
        width: '100%',
    };

    const inputDisplayStyle = {
        overflowX: 'auto' as const,
        whiteSpace: 'nowrap' as const,
        padding: '8px',
        backgroundColor: '#f5f5f5',
        borderRadius: '4px',
        maxWidth: '100%',
    };

    // Chart container style
    const chartContainerStyle = {
        margin: '20px auto',
        width: '100%',
        maxWidth: '600px',
        height: '400px',
        border: '2px dashed #ccc',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'aliceblue',
    };

    // Info box style with bluish text and a light blue background
    const infoBoxStyle = {
        backgroundColor: '#e7f3fe', // light blue background
        borderLeft: '4px solid #2196F3', // blue accent border
        padding: '15px',
        margin: '20px auto',
        maxWidth: '600px',
        color: '#0b75c9', // bluish text
        borderRadius: '4px',
    };

    useEffect(() => {
        const [lightdashUrl, rest] = embedUrl.split('embed');
        const lightdashToken = rest?.split('#')[1];
        setLightdashUrl(lightdashUrl);
        setLightdashToken(lightdashToken);
    }, [embedUrl]);

    console.log({ lightdashUrl, lightdashToken });

    if (!lightdashUrl || !lightdashToken) {
        return (
            <div style={containerStyle}>
                <div style={contentStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h3>Invalid embed URL</h3>
                        <p>Enter a Lightdash embed URL</p>

                        <EmbedUrlInput
                            draftUrl={draftUrl}
                            onDraftUrlChange={setDraftUrl}
                            onSubmit={() => {
                                console.log(draftUrl);
                                setEmbedUrl(draftUrl);
                            }}
                            onClear={() => {
                                setDraftUrl('');
                                setEmbedUrl('');
                            }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            <div style={contentStyle}>
                <header>
                    <h1 style={{ color: '#333', margin: '0 0 10px' }}>
                        Lightdash SDK
                    </h1>
                    <h4>Embed URL:</h4>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <EmbedUrlInput
                            draftUrl={draftUrl}
                            onDraftUrlChange={setDraftUrl}
                            onSubmit={() => {
                                console.log(draftUrl);
                                setEmbedUrl(draftUrl);
                            }}
                            onClear={() => {
                                setDraftUrl('');
                                setEmbedUrl('');
                            }}
                        />
                    </div>
                    <h4>Current lightdash URL:</h4>
                    <p style={inputDisplayStyle}>{lightdashUrl}</p>
                    <h4>Current lightdash token:</h4>
                    <p style={inputDisplayStyle}>{lightdashToken}</p>
                </header>

                <main>
                    <h2 style={{ color: '#555', margin: '0 0 20px' }}>
                        Dashboard component
                    </h2>
                    <p
                        style={{
                            fontSize: '1.1em',
                            lineHeight: '1.6',
                            color: '#666',
                        }}
                    >
                        This is a demo page that includes a Lightdash dashboard
                        component. The data is fetched from the Lightdash
                        server, but this app is running locally.
                    </p>

                    <div id="chart-container" style={chartContainerStyle}>
                        <Lightdash.Dashboard
                            instanceUrl={lightdashUrl}
                            token={lightdashToken}
                            styles={{
                                backgroundColor: 'transparent',
                                fontFamily: 'Comic Sans MS',
                            }}
                        />
                    </div>

                    {/* Info box with bluish text */}
                    <div style={infoBoxStyle}>
                        <p>
                            Additional Information: This chart is powered by
                            Lightdash SDK.
                        </p>
                    </div>
                    {/* TODO: decide how to handle http vs https so we can use the iframe */}
                    {/* <h2 style={{ color: '#555', margin: '0 0 20px' }}>
                        Embedded dashboard
                    </h2>
                    <iframe src={embedUrl} width="100%" height="400px" /> */}
                </main>

                <footer>
                    <p
                        style={{
                            fontSize: '0.9em',
                            color: '#999',
                            margin: '20px 0 0',
                        }}
                    >
                        &copy; 2025 Lightdash
                    </p>
                </footer>
            </div>
        </div>
    );
}

export default App;

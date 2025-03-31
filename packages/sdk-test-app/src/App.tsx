import Lightdash from '@lightdash/sdk';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// NOTE: add an embed url here for persistence
const EMBED_URL = '';

interface EmbedUrlInputProps {
    draftUrl: string;
    onDraftUrlChange: (value: string) => void;
    onSubmit: () => void;
    onClear: () => void;
    lightdashUrl?: string;
    lightdashToken?: string;
}

const inputDisplayStyle = {
    overflowX: 'auto' as const,
    whiteSpace: 'nowrap' as const,
    padding: '8px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
    maxWidth: '100%',
};

const EmbedUrlInput: React.FC<EmbedUrlInputProps> = ({
    draftUrl,
    onDraftUrlChange,
    onSubmit,
    onClear,
    lightdashUrl,
    lightdashToken,
}) => {
    const { t } = useTranslation();

    return (
        <div>
            <h4>Embed URL:</h4>
            <div style={{ display: 'flex', gap: '8px' }}>
                <input
                    type="text"
                    value={draftUrl}
                    onChange={(e) => onDraftUrlChange(e.target.value)}
                    style={{ flexGrow: 1 }}
                />
                <button onClick={onSubmit}>
                    {t('app.setUrlButton', 'Set Embed URL')}
                </button>
                <button onClick={onClear}>
                    {t('app.clearButton', 'Clear')}
                </button>
            </div>
            <h4>Current lightdash URL:</h4>
            <p style={inputDisplayStyle}>{lightdashUrl}</p>
            <h4>Current lightdash token:</h4>
            <p style={inputDisplayStyle}>{lightdashToken}</p>
        </div>
    );
};

function App() {
    const { t, i18n } = useTranslation();

    const [lightdashUrl, setLightdashUrl] = useState<string | null>(null);
    const [lightdashToken, setLightdashToken] = useState<string | null>(null);
    const [embedUrl, setEmbedUrl] = useState<string>(
        localStorage.getItem('embedUrl') || EMBED_URL,
    );
    const [draftUrl, setDraftUrl] = useState<string>(
        localStorage.getItem('embedUrl') || EMBED_URL,
    );

    const [inputsOpen, setInputsOpen] = useState(false);

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
        maxWidth: '1400px',
        width: '100%',
    };

    // Chart container style
    const chartContainerStyle = {
        width: '100%',
        height: '500px',
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
        color: '#0b75c9', // bluish text
        borderRadius: '4px',
    };

    useEffect(() => {
        const [lightdashUrl, rest] = embedUrl.split('embed');
        const lightdashToken = rest?.split('#')[1];
        setLightdashUrl(lightdashUrl);
        setLightdashToken(lightdashToken);
    }, [embedUrl]);

    return (
        <div style={containerStyle}>
            <div style={contentStyle}>
                <header>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <h1 style={{ color: '#333', margin: '0 0 10px' }}>
                            Lightdash SDK
                        </h1>
                        <div
                            style={{
                                justifyContent: 'flex-end',
                                display: 'flex',
                                gap: '8px',
                            }}
                        >
                            <button onClick={() => i18n.changeLanguage('en')}>
                                🇬🇧
                            </button>
                            <button onClick={() => i18n.changeLanguage('ka')}>
                                🇬🇪
                            </button>
                            <button onClick={() => i18n.changeLanguage('es')}>
                                🇪🇸
                            </button>
                        </div>
                        <button
                            onClick={() => setInputsOpen(!inputsOpen)}
                            color="gray"
                        >
                            {inputsOpen ? 'Hide embed URL' : 'Show embed URL'}
                        </button>
                    </div>

                    <div
                        style={{
                            width: '100%',
                            display: inputsOpen ? 'block' : 'none',
                        }}
                    >
                        <EmbedUrlInput
                            draftUrl={draftUrl}
                            onDraftUrlChange={setDraftUrl}
                            onSubmit={() => {
                                setEmbedUrl(draftUrl);
                                setInputsOpen(false);
                                localStorage.setItem('embedUrl', draftUrl);
                            }}
                            onClear={() => {
                                setDraftUrl('');
                                setEmbedUrl('');
                                localStorage.removeItem('embedUrl');
                            }}
                            lightdashUrl={lightdashUrl}
                            lightdashToken={lightdashToken}
                        />
                    </div>
                </header>

                {lightdashUrl && lightdashToken ? (
                    <main>
                        <h2
                            style={{
                                color: '#555',
                                margin: '30px 0 10px 0',
                            }}
                        >
                            {t('Dashboard component')}
                        </h2>
                        <p
                            style={{
                                fontSize: '1.1em',
                                lineHeight: '1.6',
                                color: '#666',
                            }}
                        >
                            {t(
                                'app.intro',
                                'This is a demo page that includes a Lightdash dashboard component. The data is fetched from the Lightdash server, but this app is running locally.',
                            )}
                        </p>

                        <div style={chartContainerStyle}>
                            <Lightdash.Dashboard
                                key={i18n.language}
                                instanceUrl={lightdashUrl}
                                token={lightdashToken}
                                styles={{
                                    backgroundColor: 'transparent',
                                    fontFamily: 'Comic Sans MS',
                                }}
                                contentOverrides={i18n.getResourceBundle(
                                    i18n.language,
                                    'analytics',
                                )}
                            />
                        </div>

                        {/* Info box with bluish text */}
                        <div style={infoBoxStyle}>
                            {t(
                                'Additional Information: This chart is powered by Lightdash SDK.',
                            )}
                        </div>
                    </main>
                ) : null}

                <footer
                    style={{
                        fontSize: '0.9em',
                        color: '#999',
                        margin: '20px 0 0',
                    }}
                >
                    &copy; 2025 Lightdash
                </footer>
            </div>
        </div>
    );
}

export default App;

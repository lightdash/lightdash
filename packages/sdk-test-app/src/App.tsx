import Lightdash from '@lightdash/sdk';
import '@lightdash/sdk/sdk.css';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterOperator, SavedChart } from '../../common/src';

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

// Dashboard Chart container style
const chartContainerStyle = {
    width: '100%',
    height: '500px',
    border: '2px dashed #ccc',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'aliceblue',
};

const singleChartContainerStyle = {
    width: '50%',
    height: '500px',
    border: '2px dashed #ccc',
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

    const [savedChart, setSavedChart] = useState<SavedChart | null>();
    const handleExploreClick = (options: { chart: SavedChart }) => {
        setSavedChart(options.chart);
    };

    const chartIdRef = useRef<HTMLInputElement>(null);
    const [chartUuidOrSlug, setChartUuidOrSlug] = useState<string>(
        localStorage.getItem('chartUuidOrSlug') || '',
    );

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

                        {savedChart && (
                            <button
                                style={{ marginBottom: 10 }}
                                onClick={() => setSavedChart(null)}
                            >
                                Go back to dashboard
                            </button>
                        )}

                        <div style={chartContainerStyle}>
                            {savedChart ? (
                                <Lightdash.Explore
                                    instanceUrl={lightdashUrl}
                                    token={lightdashToken}
                                    exploreId={savedChart.tableName}
                                    savedChart={savedChart}
                                />
                            ) : (
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
                                        // Namespace is the name of the file in the locales folder
                                        // (or the file in Locize)
                                        'translation',
                                    )}
                                    onExplore={handleExploreClick}
                                    // This replaces the embedded dashboard filters
                                    // filters={[{
                                    //     model: 'orders',
                                    //     field: 'is_completed',
                                    //     operator: FilterOperator.EQUALS,
                                    //     value: [true],
                                    // },]}
                                />
                            )}
                        </div>

                        {/* Info box with bluish text */}
                        <div style={infoBoxStyle}>
                            {t(
                                'Additional Information: This chart is powered by Lightdash SDK.',
                            )}
                        </div>

                        <h2
                            style={{
                                color: '#555',
                                margin: '30px 0 10px 0',
                            }}
                        >
                            {t('Chart component')}
                        </h2>
                        <p
                            style={{
                                fontSize: '1.1em',
                                lineHeight: '1.6',
                                color: '#666',
                            }}
                        >
                            {t(
                                'This section demonstrates the Chart component. Enter a chart UUID or slug to display just the visualization.',
                            )}
                        </p>

                        <div style={{ marginBottom: '10px' }}>
                            <h4>Chart UUID or Slug:</h4>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    defaultValue={chartUuidOrSlug}
                                    ref={chartIdRef}
                                    placeholder="Enter chart UUID or slug"
                                    style={{ flexGrow: 1 }}
                                />
                                <button
                                    onClick={() => {
                                        const { value } = chartIdRef.current;
                                        setChartUuidOrSlug(value);
                                        localStorage.setItem(
                                            'chartUuidOrSlug',
                                            value,
                                        );
                                    }}
                                >
                                    {t('Load Chart')}
                                </button>
                                <button
                                    onClick={() => {
                                        setChartUuidOrSlug('');
                                        localStorage.removeItem(
                                            'chartUuidOrSlug',
                                        );
                                    }}
                                >
                                    {t('Clear')}
                                </button>
                            </div>
                        </div>

                        <div style={singleChartContainerStyle}>
                            {chartUuidOrSlug ? (
                                <Lightdash.Chart
                                    instanceUrl={lightdashUrl}
                                    token={lightdashToken}
                                    styles={{
                                        backgroundColor: 'transparent',
                                        fontFamily: 'Arial, sans-serif',
                                    }}
                                    id={chartUuidOrSlug}
                                />
                            ) : (
                                <p style={{ color: '#999' }}>
                                    {t('Enter a chart UUID or slug to display')}
                                </p>
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

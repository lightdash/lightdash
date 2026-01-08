import Lightdash from '@lightdash/sdk';
import '@lightdash/sdk/sdk.css';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SavedChart } from '../../common/src';

// NOTE: add an embed url here for persistence
const EMBED_URL = '';

const mono = `'SF Mono', 'Fira Code', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace`;
const sans = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

interface EmbedUrlInputProps {
    draftUrl: string;
    onDraftUrlChange: (value: string) => void;
    onSubmit: () => void;
    onClear: () => void;
    lightdashUrl?: string;
    lightdashToken?: string;
}

const inputStyle: React.CSSProperties = {
    fontFamily: mono,
    fontSize: '13px',
    padding: '10px 12px',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    backgroundColor: '#fafafa',
    color: '#171717',
    outline: 'none',
    transition: 'border-color 0.15s ease',
};

const buttonStyle: React.CSSProperties = {
    fontFamily: sans,
    fontSize: '13px',
    fontWeight: 500,
    padding: '10px 16px',
    border: '1px solid #171717',
    borderRadius: '6px',
    backgroundColor: '#171717',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
};

const buttonSecondaryStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#fff',
    color: '#171717',
    border: '1px solid #e5e5e5',
};

const codeDisplayStyle: React.CSSProperties = {
    fontFamily: mono,
    fontSize: '12px',
    overflowX: 'auto',
    whiteSpace: 'nowrap',
    padding: '12px',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    color: '#525252',
    margin: 0,
};

const labelStyle: React.CSSProperties = {
    fontFamily: sans,
    fontSize: '12px',
    fontWeight: 500,
    color: '#525252',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
    display: 'block',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
                <label style={labelStyle}>Embed URL</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="text"
                        value={draftUrl}
                        onChange={(e) => onDraftUrlChange(e.target.value)}
                        style={{ ...inputStyle, flexGrow: 1 }}
                    />
                    <button style={buttonStyle} onClick={onSubmit}>
                        {t('app.setUrlButton', 'Set URL')}
                    </button>
                    <button style={buttonSecondaryStyle} onClick={onClear}>
                        {t('app.clearButton', 'Clear')}
                    </button>
                </div>
            </div>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '16px',
                }}
            >
                <div>
                    <label style={labelStyle}>Instance URL</label>
                    <p style={codeDisplayStyle}>{lightdashUrl || '—'}</p>
                </div>
                <div>
                    <label style={labelStyle}>Token</label>
                    <p style={codeDisplayStyle}>
                        {lightdashToken
                            ? `${lightdashToken.slice(0, 32)}...`
                            : '—'}
                    </p>
                </div>
            </div>
        </div>
    );
};

const containerStyle: React.CSSProperties = {
    fontFamily: sans,
    backgroundColor: '#fff',
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 20px',
};

const contentStyle: React.CSSProperties = {
    maxWidth: '1200px',
    width: '100%',
};

const chartContainerStyle: React.CSSProperties = {
    width: '100%',
    height: '500px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    overflow: 'hidden',
};

const singleChartContainerStyle: React.CSSProperties = {
    width: '60%',
    height: '500px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    backgroundColor: '#fafafa',
    overflow: 'hidden',
};

const infoBoxStyle: React.CSSProperties = {
    fontFamily: mono,
    fontSize: '13px',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    padding: '16px',
    margin: '24px 0',
    color: '#525252',
    borderRadius: '6px',
};

const sectionTitleStyle: React.CSSProperties = {
    fontFamily: sans,
    fontSize: '14px',
    fontWeight: 600,
    color: '#171717',
    margin: '48px 0 8px 0',
    letterSpacing: '-0.01em',
};

const sectionDescStyle: React.CSSProperties = {
    fontFamily: sans,
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#737373',
    margin: '0 0 20px 0',
};

const langButtonStyle: React.CSSProperties = {
    fontSize: '14px',
    padding: '6px 10px',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
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

    // SDK Filters state
    const [filterValue, setFilterValue] = useState<string>('');
    const [sdkFilters, setSdkFilters] = useState<
        | Array<{
              model: string;
              field: string;
              operator: string;
              value: unknown;
          }>
        | undefined
    >();

    useEffect(() => {
        const [lightdashUrl, rest] = embedUrl.split('embed');
        const lightdashToken = rest?.split('#')[1];
        setLightdashUrl(lightdashUrl);
        setLightdashToken(lightdashToken);
    }, [embedUrl]);

    return (
        <div style={containerStyle}>
            <div style={contentStyle}>
                <header
                    style={{
                        borderBottom: '1px solid #e5e5e5',
                        paddingBottom: '24px',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '20px',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                            }}
                        >
                            <h1
                                style={{
                                    fontFamily: mono,
                                    fontSize: '16px',
                                    fontWeight: 500,
                                    color: '#171717',
                                    margin: 0,
                                    letterSpacing: '-0.02em',
                                }}
                            >
                                lightdash/sdk
                            </h1>
                            <span
                                style={{
                                    fontFamily: mono,
                                    fontSize: '11px',
                                    padding: '3px 8px',
                                    backgroundColor: '#fafafa',
                                    border: '1px solid #e5e5e5',
                                    borderRadius: '4px',
                                    color: '#737373',
                                }}
                            >
                                test-app
                            </span>
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                gap: '6px',
                                alignItems: 'center',
                            }}
                        >
                            <button
                                style={langButtonStyle}
                                onClick={() => i18n.changeLanguage('en')}
                            >
                                🇬🇧 EN
                            </button>
                            <button
                                style={langButtonStyle}
                                onClick={() => i18n.changeLanguage('ka')}
                            >
                                🇬🇪 KA
                            </button>
                            <button
                                style={langButtonStyle}
                                onClick={() => i18n.changeLanguage('es')}
                            >
                                🇪🇸 ES
                            </button>
                            <div
                                style={{
                                    width: '1px',
                                    height: '20px',
                                    backgroundColor: '#e5e5e5',
                                    margin: '0 8px',
                                }}
                            />
                            <button
                                style={buttonSecondaryStyle}
                                onClick={() => setInputsOpen(!inputsOpen)}
                            >
                                {inputsOpen ? 'Hide Config' : 'Config'}
                            </button>
                        </div>
                    </div>

                    {inputsOpen && (
                        <div
                            style={{
                                marginTop: '20px',
                                paddingTop: '20px',
                                borderTop: '1px solid #e5e5e5',
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
                    )}
                </header>

                {lightdashUrl && lightdashToken ? (
                    <main>
                        <h2 style={sectionTitleStyle}>
                            {t('Dashboard component')}
                        </h2>
                        <p style={sectionDescStyle}>
                            {t(
                                'app.intro',
                                'Embedded Lightdash dashboard component. Data fetched from your Lightdash instance.',
                            )}
                        </p>

                        {/* Filter Input Section */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>
                                Test Dynamic Filters (Example: Status filter)
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    value={filterValue}
                                    onChange={(e) =>
                                        setFilterValue(e.target.value)
                                    }
                                    placeholder='e.g., "completed" or "pending"'
                                    style={{ ...inputStyle, flexGrow: 1 }}
                                />
                                <button
                                    style={buttonStyle}
                                    onClick={() => {
                                        if (filterValue.trim()) {
                                            setSdkFilters([
                                                {
                                                    model: 'orders',
                                                    field: 'status',
                                                    operator: 'equals',
                                                    value: filterValue,
                                                },
                                            ]);
                                        } else {
                                            setSdkFilters(undefined);
                                        }
                                    }}
                                >
                                    {t('Apply Filter')}
                                </button>
                                <button
                                    style={buttonSecondaryStyle}
                                    onClick={() => {
                                        setFilterValue('');
                                        setSdkFilters(undefined);
                                    }}
                                >
                                    {t('Clear Filter')}
                                </button>
                            </div>
                            {sdkFilters && sdkFilters.length > 0 && (
                                <p
                                    style={{
                                        ...codeDisplayStyle,
                                        marginTop: '8px',
                                    }}
                                >
                                    Active filter: orders.status equals "
                                    {filterValue}"
                                </p>
                            )}
                        </div>

                        {savedChart && (
                            <button
                                style={{
                                    ...buttonSecondaryStyle,
                                    marginBottom: '16px',
                                }}
                                onClick={() => setSavedChart(null)}
                            >
                                ← Back to dashboard
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
                                    }}
                                    contentOverrides={i18n.getResourceBundle(
                                        i18n.language,
                                        'translation',
                                    )}
                                    onExplore={handleExploreClick}
                                    filters={sdkFilters}
                                />
                            )}
                        </div>

                        <div style={infoBoxStyle}>
                            <code style={{ fontFamily: mono }}>
                                {t('ℹ Powered by Lightdash SDK')}
                            </code>
                        </div>

                        <h2 style={sectionTitleStyle}>
                            {t('Chart component')}
                        </h2>
                        <p style={sectionDescStyle}>
                            {t('Render a single chart by UUID or slug.')}
                        </p>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Chart UUID or Slug</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    defaultValue={chartUuidOrSlug}
                                    ref={chartIdRef}
                                    placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                                    style={{ ...inputStyle, flexGrow: 1 }}
                                />
                                <button
                                    style={buttonStyle}
                                    onClick={() => {
                                        const { value } = chartIdRef.current;
                                        setChartUuidOrSlug(value);
                                        localStorage.setItem(
                                            'chartUuidOrSlug',
                                            value,
                                        );
                                    }}
                                >
                                    {t('Load')}
                                </button>
                                <button
                                    style={buttonSecondaryStyle}
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
                                    }}
                                    id={chartUuidOrSlug}
                                />
                            ) : (
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        height: '100%',
                                        color: '#a3a3a3',
                                        fontFamily: mono,
                                        fontSize: '13px',
                                    }}
                                >
                                    {t('Enter a chart ID above')}
                                </div>
                            )}
                        </div>
                    </main>
                ) : (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '80px 20px',
                            color: '#737373',
                        }}
                    >
                        <div
                            style={{
                                fontFamily: mono,
                                fontSize: '13px',
                                padding: '16px 24px',
                                backgroundColor: '#fafafa',
                                border: '1px solid #e5e5e5',
                                borderRadius: '6px',
                            }}
                        >
                            Click <strong>Config</strong> to add your embed URL
                        </div>
                    </div>
                )}

                <footer
                    style={{
                        fontFamily: mono,
                        fontSize: '12px',
                        color: '#a3a3a3',
                        marginTop: '48px',
                        paddingTop: '24px',
                        borderTop: '1px solid #e5e5e5',
                    }}
                >
                    © 2025 Lightdash
                </footer>
            </div>
        </div>
    );
}

export default App;

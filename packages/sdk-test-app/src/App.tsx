import Lightdash, { FilterOperator } from '@lightdash/sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SavedChart } from '../../common/src';

const EMBED_URL = import.meta.env.VITE_EMBED_URL || '';
console.log('Using embed URL:', EMBED_URL);

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

const sdkOperatorOptions: Array<`${FilterOperator}`> = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    FilterOperator.IN_BETWEEN,
    FilterOperator.NOT_IN_BETWEEN,
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_THE_NEXT,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.NOT_IN_THE_CURRENT,
];

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
    minHeight: '200px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    overflow: 'auto',
    resize: 'vertical',
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

const checkboxLabelStyle: React.CSSProperties = {
    fontFamily: sans,
    fontSize: '14px',
    color: '#171717',
};

const hintTextStyle: React.CSSProperties = {
    fontFamily: sans,
    fontSize: '12px',
    lineHeight: 1.5,
    color: '#737373',
    margin: 0,
};

const panelStyle: React.CSSProperties = {
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    padding: '16px',
    backgroundColor: '#fafafa',
};

const decodeJwtPayload = (token: string) => {
    const [, payload] = token.split('.');

    if (!payload) return undefined;

    try {
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(
            normalized.length + ((4 - (normalized.length % 4)) % 4),
            '=',
        );

        return JSON.parse(atob(padded));
    } catch {
        return undefined;
    }
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
    const [sdkFilterEnabled, setSdkFilterEnabled] = useState<boolean>(
        localStorage.getItem('sdkFilterEnabled') === 'true',
    );
    const [sdkFilterModel, setSdkFilterModel] = useState<string>(
        localStorage.getItem('sdkFilterModel') || '',
    );
    const [sdkFilterField, setSdkFilterField] = useState<string>(
        localStorage.getItem('sdkFilterField') || '',
    );
    const [sdkFilterOperator, setSdkFilterOperator] =
        useState<`${FilterOperator}`>(
            (localStorage.getItem(
                'sdkFilterOperator',
            ) as `${FilterOperator}`) || FilterOperator.LESS_THAN,
        );
    const [sdkFilterValue, setSdkFilterValue] = useState<string>(
        localStorage.getItem('sdkFilterValue') || '',
    );
    const [sdkFilterUseCustomUi, setSdkFilterUseCustomUi] = useState<boolean>(
        localStorage.getItem('sdkFilterUseCustomUi') === 'true',
    );
    const [sdkFilterSelectedValue, setSdkFilterSelectedValue] =
        useState<string>(localStorage.getItem('sdkFilterSelectedValue') || '');

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

    useEffect(() => {
        localStorage.setItem('sdkFilterEnabled', String(sdkFilterEnabled));
    }, [sdkFilterEnabled]);

    useEffect(() => {
        localStorage.setItem('sdkFilterModel', sdkFilterModel);
    }, [sdkFilterModel]);

    useEffect(() => {
        localStorage.setItem('sdkFilterField', sdkFilterField);
    }, [sdkFilterField]);

    useEffect(() => {
        localStorage.setItem('sdkFilterOperator', sdkFilterOperator);
    }, [sdkFilterOperator]);

    useEffect(() => {
        localStorage.setItem('sdkFilterValue', sdkFilterValue);
    }, [sdkFilterValue]);

    useEffect(() => {
        localStorage.setItem(
            'sdkFilterUseCustomUi',
            String(sdkFilterUseCustomUi),
        );
    }, [sdkFilterUseCustomUi]);

    useEffect(() => {
        localStorage.setItem('sdkFilterSelectedValue', sdkFilterSelectedValue);
    }, [sdkFilterSelectedValue]);

    const sdkFilterOptions = useMemo(
        () =>
            sdkFilterValue
                .split(',')
                .map((value) => value.trim())
                .filter((value) => value.length > 0),
        [sdkFilterValue],
    );

    useEffect(() => {
        if (
            sdkFilterSelectedValue &&
            !sdkFilterOptions.includes(sdkFilterSelectedValue)
        ) {
            setSdkFilterSelectedValue('');
        }
    }, [sdkFilterOptions, sdkFilterSelectedValue]);

    const sdkFilters = useMemo(() => {
        if (
            !sdkFilterEnabled ||
            sdkFilterModel.trim().length === 0 ||
            sdkFilterField.trim().length === 0
        ) {
            return undefined;
        }

        const values = sdkFilterUseCustomUi
            ? sdkFilterSelectedValue
                ? [sdkFilterSelectedValue]
                : []
            : sdkFilterOptions;

        return [
            {
                model: sdkFilterModel.trim(),
                field: sdkFilterField.trim(),
                operator: sdkFilterOperator,
                value: values,
            },
        ];
    }, [
        sdkFilterEnabled,
        sdkFilterField,
        sdkFilterModel,
        sdkFilterOptions,
        sdkFilterOperator,
        sdkFilterSelectedValue,
        sdkFilterUseCustomUi,
        sdkFilterValue,
    ]);

    const decodedJwtPayload = useMemo(
        () =>
            lightdashToken ? decodeJwtPayload(lightdashToken) : undefined,
        [lightdashToken],
    );

    const jwtConfigSnippet = useMemo(
        () =>
            JSON.stringify(decodedJwtPayload?.content ?? null, null, 2) ??
            'null',
        [decodedJwtPayload],
    );

    const dashboardComponentSnippet = useMemo(() => {
        const filtersProp = sdkFilterEnabled
            ? `\n  filters={${JSON.stringify(sdkFilters ?? [], null, 2)
                  .split('\n')
                  .join('\n  ')}}`
            : '';

        return `<Lightdash.Dashboard
  instanceUrl="${lightdashUrl ?? 'http://localhost:3000/'}"
  token={token}${filtersProp}
  styles={{
    backgroundColor: 'transparent',
  }}
  contentOverrides={translations}
  onExplore={handleExploreClick}
/>`;
    }, [lightdashUrl, sdkFilterEnabled, sdkFilters]);

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

                            <div
                                style={{
                                    marginTop: '24px',
                                    display: 'grid',
                                    gridTemplateColumns: '1fr',
                                    gap: '16px',
                                }}
                            >
                                <div>
                                    <label style={labelStyle}>
                                        JWT config
                                    </label>
                                    <pre
                                        style={{
                                            ...codeDisplayStyle,
                                            whiteSpace: 'pre-wrap',
                                        }}
                                    >
                                        {jwtConfigSnippet}
                                    </pre>
                                </div>
                            </div>

                            <div
                                style={{
                                    marginTop: '24px',
                                    paddingTop: '20px',
                                    borderTop: '1px solid #e5e5e5',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '16px',
                                }}
                            >
                                <div>
                                    <label style={labelStyle}>
                                        SDK Filter Test
                                    </label>
                                    <p style={hintTextStyle}>
                                        Pass a runtime <code>filters</code> prop
                                        to the dashboard. Use the custom UI demo
                                        below to simulate a dropdown with
                                        suggested values and an empty default
                                        state.
                                    </p>
                                </div>

                                <label
                                    style={{
                                        ...checkboxLabelStyle,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={sdkFilterEnabled}
                                        onChange={(e) =>
                                            setSdkFilterEnabled(
                                                e.target.checked,
                                            )
                                        }
                                    />
                                    Enable SDK filter override
                                </label>

                                {sdkFilterEnabled && (
                                    <>
                                        <label
                                            style={{
                                                ...checkboxLabelStyle,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={sdkFilterUseCustomUi}
                                                onChange={(e) =>
                                                    setSdkFilterUseCustomUi(
                                                        e.target.checked,
                                                    )
                                                }
                                            />
                                            Drive filter from custom select demo
                                        </label>

                                        <div
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: '1fr 1fr',
                                                gap: '16px',
                                            }}
                                        >
                                            <div>
                                                <label style={labelStyle}>
                                                    Model
                                                </label>
                                                <input
                                                    type="text"
                                                    value={sdkFilterModel}
                                                    onChange={(e) =>
                                                        setSdkFilterModel(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="e.g. orders"
                                                    style={{
                                                        ...inputStyle,
                                                        width: '100%',
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>
                                                    Field
                                                </label>
                                                <input
                                                    type="text"
                                                    value={sdkFilterField}
                                                    onChange={(e) =>
                                                        setSdkFilterField(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="e.g. created_day"
                                                    style={{
                                                        ...inputStyle,
                                                        width: '100%',
                                                    }}
                                                />
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
                                                <label style={labelStyle}>
                                                    Operator
                                                </label>
                                                <select
                                                    value={sdkFilterOperator}
                                                    onChange={(e) =>
                                                        setSdkFilterOperator(
                                                            e.target
                                                                .value as `${FilterOperator}`,
                                                        )
                                                    }
                                                    style={{
                                                        ...inputStyle,
                                                        width: '100%',
                                                    }}
                                                >
                                                    {sdkOperatorOptions.map(
                                                        (operator) => (
                                                            <option
                                                                key={operator}
                                                                value={operator}
                                                            >
                                                                {operator}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={labelStyle}>
                                                    Suggested values
                                                </label>
                                                <input
                                                    type="text"
                                                    value={sdkFilterValue}
                                                    onChange={(e) =>
                                                        setSdkFilterValue(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="2025-09,2025-10,2025-11"
                                                    style={{
                                                        ...inputStyle,
                                                        width: '100%',
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label style={labelStyle}>
                                                Active SDK filters prop
                                            </label>
                                            <pre style={codeDisplayStyle}>
                                                {JSON.stringify(
                                                    sdkFilters ?? [],
                                                    null,
                                                    2,
                                                )}
                                            </pre>
                                        </div>
                                    </>
                                )}
                            </div>
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

                        {sdkFilterEnabled && sdkFilterUseCustomUi && (
                            <div
                                style={{ ...panelStyle, marginBottom: '16px' }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                    }}
                                >
                                    <div>
                                        <label style={labelStyle}>
                                            Custom External Filter Demo
                                        </label>
                                        <p style={hintTextStyle}>
                                            This dropdown is rendered by the
                                            demo app, not by Lightdash. Choosing
                                            a value updates the SDK{' '}
                                            <code>filters</code> prop. Leaving
                                            it empty sends{' '}
                                            <code>value: []</code>.
                                        </p>
                                    </div>

                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1fr auto',
                                            gap: '12px',
                                            alignItems: 'end',
                                        }}
                                    >
                                        <div>
                                            <label style={labelStyle}>
                                                Selected value
                                            </label>
                                            <select
                                                value={sdkFilterSelectedValue}
                                                onChange={(e) =>
                                                    setSdkFilterSelectedValue(
                                                        e.target.value,
                                                    )
                                                }
                                                style={{
                                                    ...inputStyle,
                                                    width: '100%',
                                                }}
                                            >
                                                <option value="">
                                                    Any value
                                                </option>
                                                {sdkFilterOptions.map(
                                                    (option) => (
                                                        <option
                                                            key={option}
                                                            value={option}
                                                        >
                                                            {option}
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                        </div>
                                        <button
                                            style={buttonSecondaryStyle}
                                            onClick={() =>
                                                setSdkFilterSelectedValue('')
                                            }
                                        >
                                            Clear
                                        </button>
                                    </div>

                                    <p style={hintTextStyle}>
                                        To hide the built-in Lightdash filter
                                        pills completely, generate the embed
                                        token with{' '}
                                        <code>
                                            dashboardFiltersInteractivity:
                                            {' { '}
                                            enabled: 'all', hidden: true
                                            {' }'}
                                        </code>
                                        .
                                    </p>
                                </div>
                            </div>
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
                                    key={`${i18n.language}-${JSON.stringify(sdkFilters ?? [])}`}
                                    instanceUrl={lightdashUrl}
                                    token={lightdashToken}
                                    styles={{
                                        backgroundColor: 'transparent',
                                    }}
                                    filters={sdkFilters}
                                    contentOverrides={i18n.getResourceBundle(
                                        i18n.language,
                                        'translation',
                                    )}
                                    onExplore={handleExploreClick}
                                />
                            )}
                        </div>

                        <div style={{ marginTop: '16px' }}>
                            <label style={labelStyle}>Dashboard component</label>
                            <pre
                                style={{
                                    ...codeDisplayStyle,
                                    whiteSpace: 'pre-wrap',
                                }}
                            >
                                {dashboardComponentSnippet}
                            </pre>
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

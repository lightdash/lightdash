import type { CSSProperties, ReactNode } from 'react';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { Link } from '../router';
import { monoFontFamily, sansFontFamily } from '../styles';

type TestAppHeaderProps = {
    controls?: ReactNode;
    embedConfig: EmbedConfigState;
};

const inputStyle: CSSProperties = {
    fontFamily: monoFontFamily,
    fontSize: '13px',
    padding: '10px 12px',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    backgroundColor: '#fafafa',
    color: '#171717',
    outline: 'none',
    transition: 'border-color 0.15s ease',
};

const buttonStyle: CSSProperties = {
    fontFamily: sansFontFamily,
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

const buttonSecondaryStyle: CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#fff',
    color: '#171717',
    border: '1px solid #e5e5e5',
};

const codeDisplayStyle: CSSProperties = {
    fontFamily: monoFontFamily,
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

const labelStyle: CSSProperties = {
    fontFamily: sansFontFamily,
    fontSize: '12px',
    fontWeight: 500,
    color: '#525252',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
    display: 'block',
};

const homeLinkStyle: CSSProperties = {
    color: 'inherit',
    textDecoration: 'none',
};

function EmbedConfigPanel({ embedConfig }: { embedConfig: EmbedConfigState }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
                <label style={labelStyle}>Embed URL</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="text"
                        value={embedConfig.draftUrl}
                        onChange={(e) =>
                            embedConfig.setDraftUrl(e.target.value)
                        }
                        style={{ ...inputStyle, flexGrow: 1 }}
                    />
                    <button
                        style={buttonStyle}
                        onClick={embedConfig.applyDraftUrl}
                    >
                        Set URL
                    </button>
                    <button
                        style={buttonSecondaryStyle}
                        onClick={embedConfig.clearEmbedUrl}
                    >
                        Clear
                    </button>
                </div>
            </div>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '16px',
                }}
            >
                <div>
                    <label style={labelStyle}>Instance URL</label>
                    <p style={codeDisplayStyle}>
                        {embedConfig.instanceUrl || '—'}
                    </p>
                </div>
                <div>
                    <label style={labelStyle}>Token</label>
                    <p style={codeDisplayStyle}>
                        {embedConfig.token
                            ? `${embedConfig.token.slice(0, 32)}...`
                            : '—'}
                    </p>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Token Config</label>
                    <pre style={{ ...codeDisplayStyle, whiteSpace: 'pre-wrap' }}>
                        {embedConfig.parsedJwt
                            ? JSON.stringify(embedConfig.parsedJwt.payload, null, 2)
                            : '—'}
                    </pre>
                </div>
            </div>
        </div>
    );
}

export function TestAppHeader({ controls, embedConfig }: TestAppHeaderProps) {
    return (
        <header
            style={{
                borderBottom: '1px solid #e5e5e5',
                paddingBottom: '24px',
                marginBottom: '32px',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    marginBottom: '20px',
                    flexWrap: 'wrap',
                }}
            >
                <Link href="/" style={homeLinkStyle}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        }}
                    >
                        <h1
                            style={{
                                fontFamily: monoFontFamily,
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
                                fontFamily: monoFontFamily,
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
                </Link>
                <div
                    style={{
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                    }}
                >
                    {controls}
                    <button
                        style={buttonSecondaryStyle}
                        onClick={() =>
                            embedConfig.setIsConfigOpen(
                                !embedConfig.isConfigOpen,
                            )
                        }
                    >
                        {embedConfig.isConfigOpen ? 'Hide Config' : 'Config'}
                    </button>
                </div>
            </div>

            {embedConfig.isConfigOpen && (
                <div
                    style={{
                        marginTop: '20px',
                        paddingTop: '20px',
                        borderTop: '1px solid #e5e5e5',
                    }}
                >
                    <EmbedConfigPanel embedConfig={embedConfig} />
                </div>
            )}
        </header>
    );
}

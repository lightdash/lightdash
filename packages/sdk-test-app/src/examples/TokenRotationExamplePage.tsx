import Lightdash, { FilterOperator } from '@lightdash/sdk';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExampleLayout } from '../components/ExampleLayout';
import { ExampleSelect } from '../components/ExampleSelect';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import { monoFontFamily } from '../styles';
import {
    helperTextStyle,
    sectionTitleStyle,
} from './FiltersExamplePage.styles';

type TokenRotationExamplePageProps = {
    embedConfig: EmbedConfigState;
};

type TokenLabel = 'A' | 'B' | 'none' | 'other';

type ObservedRequest = {
    id: number;
    path: string;
    header: string | undefined;
    status: number | 'failed';
    at: string;
};

type RequestLogEntry = Omit<ObservedRequest, 'header'> & { token: TokenLabel };

type RequestListener = (request: ObservedRequest) => void;

const EMBED_TOKEN_HEADER = 'lightdash-embed-token';
const MAX_LOG_ENTRIES = 9;

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/TokenRotationExamplePage.tsx',
);

const CUSTOMER_FIRST_NAME_OPTIONS = [
    { value: '', label: 'All customers' },
    { value: 'Barbara', label: 'Barbara' },
    { value: 'David', label: 'David' },
    { value: 'Diana', label: 'Diana' },
    { value: 'Elizabeth', label: 'Elizabeth' },
];

const layoutStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '380px minmax(0, 1fr)',
    gap: '24px',
    alignItems: 'start',
};

const columnStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
};

const statusCardStyle: CSSProperties = {
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    padding: '12px 14px',
    backgroundColor: '#fafafa',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
};

const statusLabelStyle: CSSProperties = {
    fontSize: '12px',
    color: '#737373',
};

const statusValueStyle: CSSProperties = {
    fontFamily: monoFontFamily,
    fontSize: '22px',
    lineHeight: 1.1,
    color: '#171717',
};

const statusDetailStyle: CSSProperties = {
    fontFamily: monoFontFamily,
    fontSize: '12px',
    color: '#525252',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
};

const buttonStyle: CSSProperties = {
    fontSize: '13px',
    fontWeight: 500,
    padding: '10px 16px',
    border: '1px solid #171717',
    borderRadius: '6px',
    backgroundColor: '#171717',
    color: '#fff',
    cursor: 'pointer',
};

const disabledButtonStyle: CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#e5e5e5',
    border: '1px solid #e5e5e5',
    color: '#737373',
    cursor: 'not-allowed',
};

const tokenInputStyle: CSSProperties = {
    ...statusDetailStyle,
    padding: '8px',
    border: '1px solid #e5e5e5',
    borderRadius: '4px',
    backgroundColor: '#fff',
};

const tableStyle: CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: monoFontFamily,
    fontSize: '12px',
};

const cellStyle: CSSProperties = {
    textAlign: 'left',
    padding: '5px 6px',
    borderBottom: '1px solid #e5e5e5',
    whiteSpace: 'nowrap',
};

const dashboardStyle: CSSProperties = {
    width: '100%',
    height: '720px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    backgroundColor: '#fafafa',
    overflow: 'auto',
};

const decodeExpiry = (token: string | null): number | null => {
    const payload = token?.split('.')[1];
    if (!payload) return null;
    try {
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = JSON.parse(atob(normalized)) as { exp?: number };
        return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
    } catch {
        return null;
    }
};

const readHeader = (headers: HeadersInit | undefined): string | undefined => {
    if (!headers) return undefined;
    if (headers instanceof Headers) {
        return headers.get(EMBED_TOKEN_HEADER) ?? undefined;
    }
    if (Array.isArray(headers)) {
        return headers.find(
            ([name]) => name.toLowerCase() === EMBED_TOKEN_HEADER,
        )?.[1];
    }
    return headers[EMBED_TOKEN_HEADER];
};

const requestUrl = (input: RequestInfo | URL): string => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    return input.url;
};

const shortPath = (url: string) => {
    try {
        const { pathname } = new URL(url, window.location.origin);
        return pathname
            .replace(/^\/api\/v\d+/, '')
            .replace(/[0-9a-f-]{36}/g, '…');
    } catch {
        return url;
    }
};

// Installed once per page so the very first SDK requests are logged too.
let requestListener: RequestListener | null = null;
let observedOrigin: string | null = null;
let nextRequestId = 1;
let isFetchWrapped = false;

const isInstanceRequest = (url: string) => {
    try {
        const parsed = new URL(url, window.location.origin);
        return (
            parsed.origin === observedOrigin &&
            parsed.pathname.includes('/api/')
        );
    } catch {
        return false;
    }
};

const wrapFetch = () => {
    if (isFetchWrapped) return;
    isFetchWrapped = true;
    const originalFetch = window.fetch;

    window.fetch = async (input, init) => {
        const url = requestUrl(input);
        if (!requestListener || !isInstanceRequest(url)) {
            return originalFetch(input, init);
        }
        const listener = requestListener;
        const entry = {
            id: nextRequestId++,
            path: shortPath(url),
            header: readHeader(init?.headers),
            at: new Date().toLocaleTimeString(),
        };
        try {
            const response = await originalFetch(input, init);
            listener({ ...entry, status: response.status });
            return response;
        } catch (error) {
            listener({ ...entry, status: 'failed' });
            throw error;
        }
    };
};

const formatSeconds = (ms: number) => `${Math.max(0, Math.ceil(ms / 1000))}s`;

export function TokenRotationExamplePage({
    embedConfig,
}: TokenRotationExamplePageProps) {
    const query = useMemo(
        () => new URLSearchParams(window.location.search),
        [],
    );
    const instanceUrl =
        embedConfig.instanceUrl ??
        query.get('instanceUrl') ??
        'http://localhost:3000/';
    const tokenA = query.get('tokenA') ?? embedConfig.token;
    const [tokenB, setTokenB] = useState(query.get('tokenB') ?? '');
    const [activeToken, setActiveToken] = useState<'A' | 'B'>('A');
    const [selectedCustomerFirstName, setSelectedCustomerFirstName] =
        useState('');
    const [requestLog, setRequestLog] = useState<RequestLogEntry[]>([]);
    const [requestCount, setRequestCount] = useState(0);
    const [now, setNow] = useState(() => Date.now());

    const tokensRef = useRef({ tokenA, tokenB });
    tokensRef.current = { tokenA, tokenB };

    const recordRequest: RequestListener = ({ header, ...entry }) => {
        const token: TokenLabel = !header
            ? 'none'
            : header === tokensRef.current.tokenA
              ? 'A'
              : header === tokensRef.current.tokenB
                ? 'B'
                : 'other';
        setRequestLog((log) =>
            [{ ...entry, token }, ...log].slice(0, MAX_LOG_ENTRIES),
        );
        setRequestCount((count) => count + 1);
    };
    const recordRequestRef = useRef(recordRequest);
    recordRequestRef.current = recordRequest;

    // Subscribe during the first render so child SDK requests are captured.
    useState(() => {
        wrapFetch();
        observedOrigin = new URL(instanceUrl).origin;
        requestListener = (request) => recordRequestRef.current(request);
        return null;
    });

    useEffect(() => {
        requestListener = (request) => recordRequestRef.current(request);
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => {
            window.clearInterval(timer);
            requestListener = null;
        };
    }, []);

    const currentToken = activeToken === 'A' ? tokenA : tokenB;
    const expiryA = decodeExpiry(tokenA);
    const expiryB = decodeExpiry(tokenB || null);
    const lastRequest = requestLog[0];

    const dashboardFilters = useMemo(
        () =>
            selectedCustomerFirstName
                ? [
                      {
                          model: 'customers',
                          field: 'first_name',
                          operator: FilterOperator.EQUALS,
                          value: [selectedCustomerFirstName],
                      },
                  ]
                : [],
        [selectedCustomerFirstName],
    );

    const describeExpiry = (expiry: number | null) => {
        if (expiry === null) return 'no expiry';
        return expiry > now
            ? `expires in ${formatSeconds(expiry - now)}`
            : `expired ${formatSeconds(now - expiry)} ago`;
    };

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Token rotation demo"
            description={
                <>
                    Rotate the `token` prop from A to B while the same
                    `Lightdash.Dashboard` stays mounted, then see which token
                    each SDK request actually carries.
                </>
            }
        >
            {instanceUrl && tokenA ? (
                <div style={layoutStyle} data-testid="token-rotation">
                    <div style={columnStyle}>
                        <div style={statusCardStyle}>
                            <span style={statusLabelStyle}>
                                Token in the prop
                            </span>
                            <span
                                style={statusValueStyle}
                                data-testid="prop-token"
                            >
                                {activeToken}
                            </span>
                            <span style={statusDetailStyle}>
                                A {describeExpiry(expiryA)}
                            </span>
                            {tokenB ? (
                                <span style={statusDetailStyle}>
                                    B {describeExpiry(expiryB)}
                                </span>
                            ) : null}
                        </div>
                        <div style={statusCardStyle}>
                            <span style={statusLabelStyle}>
                                Last request header
                            </span>
                            <span
                                style={statusValueStyle}
                                data-testid="last-request-token"
                            >
                                {lastRequest?.token ?? '–'}
                            </span>
                            <span
                                style={statusDetailStyle}
                                data-testid="last-request-status"
                            >
                                {lastRequest
                                    ? `${lastRequest.status} ${lastRequest.path}`
                                    : 'no requests yet'}
                            </span>
                        </div>
                        <div style={statusCardStyle}>
                            <button
                                type="button"
                                data-testid="rotate-button"
                                style={
                                    tokenB && activeToken === 'A'
                                        ? buttonStyle
                                        : disabledButtonStyle
                                }
                                disabled={!tokenB || activeToken === 'B'}
                                onClick={() => setActiveToken('B')}
                            >
                                {activeToken === 'B'
                                    ? 'Rotated to token B'
                                    : 'Rotate to token B'}
                            </button>
                            <input
                                type="text"
                                placeholder="Paste token B"
                                value={tokenB}
                                onChange={(event) =>
                                    setTokenB(event.target.value.trim())
                                }
                                style={tokenInputStyle}
                            />
                        </div>
                        <ExampleSelect
                            label="Customer first name"
                            value={selectedCustomerFirstName}
                            onChange={setSelectedCustomerFirstName}
                            options={CUSTOMER_FIRST_NAME_OPTIONS}
                            helperText="Updates the filters prop, so the tiles query again. No remount, no key change."
                        />
                        <div>
                            <h3 style={sectionTitleStyle}>Request log</h3>
                            <table
                                style={tableStyle}
                                data-testid="request-log"
                                data-request-count={requestCount}
                            >
                                <thead>
                                    <tr>
                                        <th style={cellStyle}>time</th>
                                        <th style={cellStyle}>token</th>
                                        <th style={cellStyle}>status</th>
                                        <th style={cellStyle}>path</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {requestLog.map((entry) => (
                                        <tr key={entry.id}>
                                            <td style={cellStyle}>
                                                {entry.at}
                                            </td>
                                            <td style={cellStyle}>
                                                {entry.token}
                                            </td>
                                            <td style={cellStyle}>
                                                {entry.status}
                                            </td>
                                            <td style={cellStyle}>
                                                {entry.path}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {requestLog.length === 0 ? (
                                <p style={helperTextStyle}>
                                    SDK requests to /api/ will show up here.
                                </p>
                            ) : null}
                        </div>
                    </div>
                    <div style={dashboardStyle} data-testid="dashboard-frame">
                        <Lightdash.Dashboard
                            instanceUrl={instanceUrl}
                            token={currentToken ?? ''}
                            filters={dashboardFilters}
                            styles={{ backgroundColor: 'transparent' }}
                        />
                    </div>
                </div>
            ) : (
                <p style={helperTextStyle}>
                    Click Config to add an embed URL, or open this page with
                    ?tokenA=…&tokenB=… in the query string.
                </p>
            )}
        </ExampleLayout>
    );
}

import Lightdash, { type SdkError } from '@lightdash/sdk';
import { useState, type CSSProperties } from 'react';
import { ExampleLayout } from '../components/ExampleLayout';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import { emptyStateBoxStyle, emptyStateStyle, monoFontFamily } from '../styles';
import {
    dashboardContainerStyle,
    sectionDescStyle,
    sectionTitleStyle,
} from './PaletteUuidExamplePage.styles';

type ErrorHandlingExamplePageProps = {
    embedConfig: EmbedConfigState;
};

type Scenario = 'valid' | 'malformed' | 'tampered' | 'unreachable';

const scenarios: { value: Scenario; label: string }[] = [
    { value: 'valid', label: 'Valid token' },
    { value: 'malformed', label: 'Malformed token' },
    { value: 'tampered', label: 'Tampered signature' },
    { value: 'unreachable', label: 'Unreachable server' },
];

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/ErrorHandlingExamplePage.tsx',
);

const tamperSignature = (token: string) => {
    const lastChar = token.slice(-1);
    return `${token.slice(0, -1)}${lastChar === 'A' ? 'B' : 'A'}`;
};

const getScenarioProps = (
    scenario: Scenario,
    instanceUrl: string,
    token: string,
) => {
    switch (scenario) {
        case 'malformed':
            return { instanceUrl, token: 'not-a-jwt' };
        case 'tampered':
            return { instanceUrl, token: tamperSignature(token) };
        case 'unreachable':
            return { instanceUrl: 'http://localhost:9/', token };
        case 'valid':
        default:
            return { instanceUrl, token };
    }
};

const hostErrorCopy: Record<SdkError['kind'], string> = {
    network: 'We could not reach the reporting service. Check your connection.',
    token_expired: 'Your session has expired. Refresh the page to continue.',
    invalid_token:
        'This report link is not valid. Ask your manager for a new one.',
    unauthorized: 'You need to sign in again to see this report.',
    forbidden: 'You do not have access to this report.',
    not_found: 'This report no longer exists.',
    invalid_request: 'This report could not be loaded.',
    server: 'Something went wrong on our side.',
    render: 'Something went wrong while showing this report.',
    unknown: 'Something went wrong.',
};

const hostErrorStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: '100%',
    padding: 24,
    textAlign: 'center',
    background: '#fff7ed',
    color: '#9a3412',
};

const logStyle: CSSProperties = {
    fontFamily: monoFontFamily,
    fontSize: 12,
    background: '#171717',
    color: '#e5e5e5',
    borderRadius: 8,
    padding: 12,
    maxHeight: 220,
    overflow: 'auto',
    margin: 0,
};

export function ErrorHandlingExamplePage({
    embedConfig,
}: ErrorHandlingExamplePageProps) {
    const [scenario, setScenario] = useState<Scenario>('valid');
    const [attempt, setAttempt] = useState(0);
    const [fatalError, setFatalError] = useState<SdkError | null>(null);
    const [errorLog, setErrorLog] = useState<SdkError[]>([]);

    const handleError = (error: SdkError) => {
        setErrorLog((log) => [error, ...log]);
        if (error.fatal) {
            setFatalError(error);
        }
    };

    const retry = () => {
        setFatalError(null);
        setAttempt((value) => value + 1);
    };

    const selectScenario = (value: Scenario) => {
        setScenario(value);
        setErrorLog([]);
        retry();
    };

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Error handling demo"
            description={
                <>
                    The host passes <code>onError</code> to{' '}
                    <code>Lightdash.Dashboard</code>. When an error is{' '}
                    <code>fatal</code>, the host stops rendering the SDK
                    component and shows its own screen. Retry remounts the
                    component by changing its <code>key</code>.
                </>
            }
        >
            {embedConfig.instanceUrl && embedConfig.token ? (
                <section>
                    <h3 style={sectionTitleStyle}>Scenario</h3>
                    <p style={sectionDescStyle}>
                        {scenarios.map(({ value, label }) => (
                            <label key={value} style={{ marginRight: 16 }}>
                                <input
                                    type="radio"
                                    name="scenario"
                                    checked={scenario === value}
                                    onChange={() => selectScenario(value)}
                                />{' '}
                                {label}
                            </label>
                        ))}
                    </p>
                    <div style={dashboardContainerStyle}>
                        {fatalError ? (
                            <div
                                style={hostErrorStyle}
                                data-testid="host-error"
                            >
                                <strong>
                                    {hostErrorCopy[fatalError.kind]}
                                </strong>
                                {fatalError.retryable && (
                                    <button type="button" onClick={retry}>
                                        Try again
                                    </button>
                                )}
                            </div>
                        ) : (
                            <Lightdash.Dashboard
                                key={`${embedConfig.remountKey}-${attempt}`}
                                {...getScenarioProps(
                                    scenario,
                                    embedConfig.instanceUrl,
                                    embedConfig.token,
                                )}
                                onError={handleError}
                            />
                        )}
                    </div>
                    <h3 style={{ ...sectionTitleStyle, marginTop: 24 }}>
                        onError calls
                    </h3>
                    <pre style={logStyle} data-testid="error-log">
                        {errorLog.length
                            ? errorLog
                                  .map((error) => JSON.stringify(error))
                                  .join('\n')
                            : 'No errors reported yet'}
                    </pre>
                </section>
            ) : (
                <div style={emptyStateStyle}>
                    <div style={emptyStateBoxStyle}>
                        Click <strong>Config</strong> to add your embed URL
                    </div>
                </div>
            )}
        </ExampleLayout>
    );
}

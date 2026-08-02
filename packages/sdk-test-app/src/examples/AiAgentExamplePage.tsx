import Lightdash, {
    useLightdashAiAgentThreads,
    type LightdashAiAgentThread,
    type LightdashApiClientConfig,
    type ListAiAgentThreadsOptions,
} from '@lightdash/sdk';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ExampleLayout } from '../components/ExampleLayout';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import {
    emptyStateBoxStyle,
    emptyStateStyle,
    monoFontFamily,
} from '../styles';
import {
    dashboardContainerStyle,
    sectionDescStyle,
    sectionTitleStyle,
} from './PaletteUuidExamplePage.styles';

type AiAgentExamplePageProps = {
    embedConfig: EmbedConfigState;
};

type JwtPayload = {
    content: {
        projectUuid: string;
    };
};

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/AiAgentExamplePage.tsx',
);

const defaultAiAgentEmbedUrl = import.meta.env.VITE_AI_AGENT_EMBED_URL ?? '';
const latestAiAgentThreadStorageKey = 'lightdash:sdk-test-app:ai-agent-thread';
const EMPTY_AI_AGENT_THREADS: LightdashAiAgentThread[] = [];

const isJwtPayload = (payload: unknown): payload is JwtPayload => {
    if (typeof payload !== 'object' || payload === null) return false;
    if (!('content' in payload)) return false;

    const { content } = payload;

    return (
        typeof content === 'object' &&
        content !== null &&
        'projectUuid' in content &&
        typeof content.projectUuid === 'string' &&
        content.projectUuid.length > 0
    );
};

const threadHistoryStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(240px, 420px) minmax(0, 1fr)',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '12px',
};

const threadSelectStyle: CSSProperties = {
    width: '100%',
    minHeight: '40px',
    padding: '0 12px',
    border: '1px solid #d4d4d4',
    borderRadius: '6px',
    backgroundColor: '#fff',
    color: '#171717',
};

const threadStatusStyle: CSSProperties = {
    color: '#737373',
    fontFamily: monoFontFamily,
    fontSize: '12px',
};

const explainerSectionStyle: CSSProperties = {
    marginTop: '24px',
    paddingTop: '20px',
    borderTop: '1px solid #e5e5e5',
};

const explainerGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(240px, 360px) minmax(0, 1fr)',
    gap: '20px',
    alignItems: 'start',
};

const explainerListStyle: CSSProperties = {
    margin: 0,
    paddingLeft: '18px',
    color: '#525252',
    fontSize: '13px',
    lineHeight: 1.6,
};

const codeBlockStyle: CSSProperties = {
    margin: 0,
    padding: '14px',
    overflowX: 'auto',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    backgroundColor: '#171717',
    color: '#f5f5f5',
    fontFamily: monoFontFamily,
    fontSize: '12px',
    lineHeight: 1.6,
};

const aiAgentThreadSnippet = `import Lightdash, {
    useLightdashAiAgentThreads,
    type LightdashApiClientConfig,
} from '@lightdash/sdk';

const apiConfig: LightdashApiClientConfig = {
    instanceUrl,
    projectUuid,
    auth: { type: 'embedToken', token },
};

const threads = useLightdashAiAgentThreads(apiConfig, {
    projectUuid,
    agentUuid,
});

const [threadUuid, setThreadUuid] = useState<string>();

return (
    <>
        <select onChange={(event) => setThreadUuid(event.target.value)}>
            <option value="">Start a new thread</option>
            {threads.data?.map((thread) => (
                <option key={thread.uuid} value={thread.uuid}>
                    {thread.title ?? thread.firstMessage.message}
                </option>
            ))}
        </select>

        <Lightdash.AiAgent
            instanceUrl={instanceUrl}
            token={token}
            agentUuid={agentUuid}
            threadUuid={threadUuid}
            onThreadChange={({ threadUuid }) => {
                setThreadUuid(threadUuid);
                threads.refetch();
            }}
        />
    </>
);`;

const truncateThreadLabel = (label: string) =>
    label.length > 96 ? `${label.slice(0, 93)}...` : label;

const getThreadLabel = (thread: LightdashAiAgentThread) =>
    truncateThreadLabel(thread.title ?? thread.firstMessage.message);

const getProjectUuid = (
    aiAgentEmbedProjectUuid: string | null,
    embedConfig: EmbedConfigState,
) =>
    aiAgentEmbedProjectUuid ??
    (isJwtPayload(embedConfig.parsedJwt?.payload)
        ? embedConfig.parsedJwt.payload.content.projectUuid
        : null);

const parseEmbedUrl = (
    value: string,
): {
    instanceUrl: string | null;
    token: string | null;
    agentUuid: string | null;
    projectUuid: string | null;
    threadUuid: string | null;
} => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
        return {
            instanceUrl: null,
            token: null,
            agentUuid: null,
            projectUuid: null,
            threadUuid: null,
        };
    }

    try {
        const url = new URL(trimmedValue);
        const embedSegmentIndex = url.pathname.indexOf('/embed');
        const instancePath =
            embedSegmentIndex >= 0
                ? url.pathname.slice(0, embedSegmentIndex)
                : url.pathname;

        const normalizedPath = instancePath.endsWith('/')
            ? instancePath
            : `${instancePath}/`;

        const agentMatch = url.pathname.match(/\/ai-agents\/([^/]+)/);
        const projectMatch = url.pathname.match(/\/embed\/([^/]+)/);
        const threadMatch = url.pathname.match(/\/threads\/([^/]+)/);

        return {
            instanceUrl: `${url.origin}${normalizedPath}`,
            token: url.hash ? url.hash.slice(1) : null,
            agentUuid: agentMatch?.[1] ?? null,
            projectUuid: projectMatch?.[1] ?? null,
            threadUuid: threadMatch?.[1] ?? null,
        };
    } catch {
        const [instancePart, tokenPart] = trimmedValue.split('#');
        const embedSegmentIndex = instancePart.indexOf('embed');
        const maybeInstanceUrl =
            embedSegmentIndex >= 0
                ? instancePart.slice(0, embedSegmentIndex)
                : instancePart;
        const agentMatch = instancePart.match(/\/ai-agents\/([^/]+)/);
        const projectMatch = instancePart.match(/\/embed\/([^/]+)/);
        const threadMatch = instancePart.match(/\/threads\/([^/]+)/);

        return {
            instanceUrl: maybeInstanceUrl || null,
            token: tokenPart || null,
            agentUuid: agentMatch?.[1] ?? null,
            projectUuid: projectMatch?.[1] ?? null,
            threadUuid: threadMatch?.[1] ?? null,
        };
    }
};

export function AiAgentExamplePage({ embedConfig }: AiAgentExamplePageProps) {
    const aiAgentEmbedConfig = parseEmbedUrl(defaultAiAgentEmbedUrl);
    const instanceUrl =
        aiAgentEmbedConfig.instanceUrl ?? embedConfig.instanceUrl;
    const token = aiAgentEmbedConfig.token ?? embedConfig.token;
    const agentUuid = aiAgentEmbedConfig.agentUuid?.trim() ?? null;
    const projectUuid = getProjectUuid(
        aiAgentEmbedConfig.projectUuid,
        embedConfig,
    );
    const defaultThreadUuid = aiAgentEmbedConfig.threadUuid ?? '';
    const [latestThreadUuid, setLatestThreadUuid] = useState('');
    const [resumeThreadUuid, setResumeThreadUuid] = useState(defaultThreadUuid);
    const remountKey = `${defaultAiAgentEmbedUrl || embedConfig.remountKey}:${
        resumeThreadUuid || 'new'
    }`;

    const hasRequiredConfig = !!instanceUrl && !!token && !!agentUuid;
    const apiInstanceUrl =
        import.meta.env.DEV && typeof window !== 'undefined'
            ? `${window.location.origin}/sdk-test-app-api/lightdash`
            : instanceUrl ?? '';
    const apiConfig = useMemo<LightdashApiClientConfig>(
        () => ({
            instanceUrl: apiInstanceUrl,
            projectUuid: projectUuid ?? undefined,
            auth: token
                ? {
                      type: 'embedToken',
                      token,
                  }
                : undefined,
        }),
        [apiInstanceUrl, projectUuid, token],
    );
    const aiAgentThreadArgs = useMemo<ListAiAgentThreadsOptions>(
        () => ({
            agentUuid: agentUuid ?? '',
            projectUuid: projectUuid ?? undefined,
        }),
        [agentUuid, projectUuid],
    );
    const aiAgentThreadsQuery = useLightdashAiAgentThreads(
        apiConfig,
        aiAgentThreadArgs,
        {
            enabled: hasRequiredConfig && !!projectUuid,
        },
    );
    const aiAgentThreads =
        aiAgentThreadsQuery.data ?? EMPTY_AI_AGENT_THREADS;
    const threadStatus = !projectUuid
        ? 'Thread history needs a project UUID in the embed URL or token'
        : aiAgentThreadsQuery.isLoading
        ? 'Loading threads'
        : aiAgentThreadsQuery.error
        ? aiAgentThreadsQuery.error.message
        : `${aiAgentThreads.length} previous ${
              aiAgentThreads.length === 1 ? 'thread' : 'threads'
          }`;

    useEffect(() => {
        const storedThreadUuid =
            localStorage.getItem(latestAiAgentThreadStorageKey) ?? '';
        setLatestThreadUuid(storedThreadUuid);
        setResumeThreadUuid(defaultThreadUuid || storedThreadUuid);
    }, [defaultThreadUuid]);

    const handleThreadChange = ({ threadUuid }: { threadUuid: string }) => {
        setLatestThreadUuid(threadUuid);
        localStorage.setItem(latestAiAgentThreadStorageKey, threadUuid);
        aiAgentThreadsQuery.refetch();
    };

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="AI agent demo"
            description={
                <>
                    This example embeds an AI agent with{' '}
                    <code>Lightdash.AiAgent</code>. The configured embed token
                    must use <code>content.type = "aiAgent"</code>, include the
                    agent UUID, and set a write actor plus{' '}
                    <code>writeActions.spaceUuid</code>; agent tools are limited
                    to that space.
                </>
            }
        >
            {instanceUrl && token ? (
                <>
                    <section>
                        <h3 style={sectionTitleStyle}>AI agent</h3>
                        <p style={sectionDescStyle}>
                            The agent and write-action scope come from the
                            configured AI-agent embed URL and JWT.
                        </p>
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 8,
                                marginBottom: 12,
                            }}
                        >
                            <input
                                aria-label="AI agent thread UUID"
                                placeholder="Thread UUID to resume"
                                value={resumeThreadUuid}
                                onChange={(event) =>
                                    setResumeThreadUuid(event.target.value)
                                }
                                style={{
                                    flex: '1 1 320px',
                                    minWidth: 0,
                                    padding: '8px 10px',
                                }}
                            />
                            <button
                                type="button"
                                onClick={() =>
                                    setResumeThreadUuid(latestThreadUuid)
                                }
                                disabled={!latestThreadUuid}
                            >
                                Use latest
                            </button>
                        </div>
                        <div style={threadHistoryStyle}>
                            <select
                                aria-label="AI agent thread history"
                                value=""
                                disabled={
                                    !projectUuid ||
                                    aiAgentThreadsQuery.isLoading ||
                                    !!aiAgentThreadsQuery.error ||
                                    aiAgentThreads.length === 0
                                }
                                onChange={(event) => {
                                    setResumeThreadUuid(event.target.value);
                                }}
                                style={threadSelectStyle}
                            >
                                <option value="">Select a previous thread</option>
                                {aiAgentThreads.map((thread) => (
                                    <option
                                        key={thread.uuid}
                                        value={thread.uuid}
                                    >
                                        {getThreadLabel(thread)}
                                    </option>
                                ))}
                            </select>
                            <span style={threadStatusStyle}>
                                {threadStatus}
                            </span>
                        </div>
                        {hasRequiredConfig ? (
                            <div style={dashboardContainerStyle}>
                                <Lightdash.AiAgent
                                    key={`${remountKey}:${agentUuid}`}
                                    instanceUrl={instanceUrl}
                                    token={token}
                                    agentUuid={agentUuid}
                                    threadUuid={
                                        resumeThreadUuid.trim() || undefined
                                    }
                                    onThreadChange={handleThreadChange}
                                />
                            </div>
                        ) : (
                            <div style={emptyStateStyle}>
                                <div style={emptyStateBoxStyle}>
                                    Set <code>VITE_AI_AGENT_EMBED_URL</code> to
                                    render the AI agent
                                </div>
                            </div>
                        )}
                    </section>
                    <section style={explainerSectionStyle}>
                        <h3 style={sectionTitleStyle}>
                            Resuming previous threads
                        </h3>
                        <div style={explainerGridStyle}>
                            <div>
                                <p style={sectionDescStyle}>
                                    Use <code>useLightdashAiAgentThreads</code>{' '}
                                    to fetch the AI-agent threads available to
                                    the current embed token. Passing a selected{' '}
                                    <code>threadUuid</code> to{' '}
                                    <code>Lightdash.AiAgent</code> resumes that
                                    conversation; leaving it empty starts a new
                                    one.
                                </p>
                                <ol style={explainerListStyle}>
                                    <li>
                                        The hook uses the same embed JWT as the
                                        iframe.
                                    </li>
                                    <li>
                                        Results are scoped to the token actor and
                                        embedded space.
                                    </li>
                                    <li>
                                        <code>onThreadChange</code> fires when a
                                        new thread is created or opened, so the
                                        host app can store the latest thread UUID
                                        or refresh the list.
                                    </li>
                                </ol>
                            </div>
                            <pre style={codeBlockStyle}>
                                <code>{aiAgentThreadSnippet}</code>
                            </pre>
                        </div>
                    </section>
                </>
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

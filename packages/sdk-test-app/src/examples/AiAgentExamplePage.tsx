import Lightdash from '@lightdash/sdk';
import { ExampleLayout } from '../components/ExampleLayout';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import { emptyStateBoxStyle, emptyStateStyle } from '../styles';
import {
    dashboardContainerStyle,
    sectionDescStyle,
    sectionTitleStyle,
} from './PaletteUuidExamplePage.styles';

type AiAgentExamplePageProps = {
    embedConfig: EmbedConfigState;
};

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/AiAgentExamplePage.tsx',
);

const defaultAiAgentEmbedUrl = import.meta.env.VITE_AI_AGENT_EMBED_URL ?? '';

const parseEmbedUrl = (
    value: string,
): {
    instanceUrl: string | null;
    token: string | null;
    agentUuid: string | null;
} => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
        return { instanceUrl: null, token: null, agentUuid: null };
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

        return {
            instanceUrl: `${url.origin}${normalizedPath}`,
            token: url.hash ? url.hash.slice(1) : null,
            agentUuid: agentMatch?.[1] ?? null,
        };
    } catch {
        const [instancePart, tokenPart] = trimmedValue.split('#');
        const embedSegmentIndex = instancePart.indexOf('embed');
        const maybeInstanceUrl =
            embedSegmentIndex >= 0
                ? instancePart.slice(0, embedSegmentIndex)
                : instancePart;
        const agentMatch = instancePart.match(/\/ai-agents\/([^/]+)/);

        return {
            instanceUrl: maybeInstanceUrl || null,
            token: tokenPart || null,
            agentUuid: agentMatch?.[1] ?? null,
        };
    }
};

export function AiAgentExamplePage({ embedConfig }: AiAgentExamplePageProps) {
    const aiAgentEmbedConfig = parseEmbedUrl(defaultAiAgentEmbedUrl);
    const instanceUrl =
        aiAgentEmbedConfig.instanceUrl ?? embedConfig.instanceUrl;
    const token = aiAgentEmbedConfig.token ?? embedConfig.token;
    const agentUuid = aiAgentEmbedConfig.agentUuid?.trim() ?? null;
    const remountKey = defaultAiAgentEmbedUrl || embedConfig.remountKey;

    const hasRequiredConfig = !!instanceUrl && !!token && !!agentUuid;

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
                        {hasRequiredConfig ? (
                            <div style={dashboardContainerStyle}>
                                <Lightdash.AiAgent
                                    key={`${remountKey}:${agentUuid}`}
                                    instanceUrl={instanceUrl}
                                    token={token}
                                    agentUuid={agentUuid}
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

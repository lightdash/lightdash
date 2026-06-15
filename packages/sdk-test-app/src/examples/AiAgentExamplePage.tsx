import Lightdash from '@lightdash/sdk';
import { useState } from 'react';
import { ExampleLayout } from '../components/ExampleLayout';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import { emptyStateBoxStyle, emptyStateStyle } from '../styles';
import { inputStyle, labelStyle } from './I18nExamplePage.styles';
import {
    dashboardContainerStyle,
    filterPanelGridStyle,
    infoBoxStyle,
    sectionDescStyle,
    sectionTitleStyle,
} from './PaletteUuidExamplePage.styles';

type AiAgentExamplePageProps = {
    embedConfig: EmbedConfigState;
};

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/AiAgentExamplePage.tsx',
);

const defaultAgentUuid = import.meta.env.VITE_AI_AGENT_UUID ?? '';
const defaultAiAgentEmbedUrl = import.meta.env.VITE_AI_AGENT_EMBED_URL ?? '';

const parseEmbedUrl = (value: string) => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
        return { instanceUrl: null, token: null };
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

        return {
            instanceUrl: `${url.origin}${normalizedPath}`,
            token: url.hash ? url.hash.slice(1) : null,
        };
    } catch {
        const [instancePart, tokenPart] = trimmedValue.split('#');
        const embedSegmentIndex = instancePart.indexOf('embed');
        const maybeInstanceUrl =
            embedSegmentIndex >= 0
                ? instancePart.slice(0, embedSegmentIndex)
                : instancePart;

        return {
            instanceUrl: maybeInstanceUrl || null,
            token: tokenPart || null,
        };
    }
};

export function AiAgentExamplePage({ embedConfig }: AiAgentExamplePageProps) {
    const [agentUuid, setAgentUuid] = useState(defaultAgentUuid);
    const aiAgentEmbedConfig = parseEmbedUrl(defaultAiAgentEmbedUrl);
    const instanceUrl =
        aiAgentEmbedConfig.instanceUrl ?? embedConfig.instanceUrl;
    const token = aiAgentEmbedConfig.token ?? embedConfig.token;
    const remountKey =
        defaultAiAgentEmbedUrl || `${embedConfig.remountKey}:${agentUuid}`;

    const hasRequiredConfig = !!instanceUrl && !!token && !!agentUuid.trim();

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
                    <code>writeActions.spaceUuid</code>; agent tools are
                    limited to that space.
                </>
            }
        >
            {instanceUrl && token ? (
                <>
                    <section>
                        <h3 style={sectionTitleStyle}>Agent selector</h3>
                        <p style={sectionDescStyle}>
                            Set <code>VITE_AI_AGENT_EMBED_URL</code> and{' '}
                            <code>VITE_AI_AGENT_UUID</code>, or paste an agent
                            UUID below.
                        </p>

                        <div style={filterPanelGridStyle}>
                            <div>
                                <label htmlFor="agentUuid" style={labelStyle}>
                                    Agent UUID
                                </label>
                                <input
                                    id="agentUuid"
                                    value={agentUuid}
                                    onChange={(event) =>
                                        setAgentUuid(event.target.value)
                                    }
                                    placeholder="00000000-0000-0000-0000-000000000000"
                                    style={{ ...inputStyle, width: '100%' }}
                                />
                            </div>

                            <div>
                                <label style={labelStyle}>Required token</label>
                                <pre style={infoBoxStyle}>
                                    {JSON.stringify(
                                        {
                                            content: {
                                                type: 'aiAgent',
                                                agentUuid:
                                                    'agent-for-this-embed',
                                            },
                                            writeActions: {
                                                serviceAccountUserUuid:
                                                    'service-account-write-user',
                                                spaceUuid:
                                                    'space-for-agent-tools',
                                            },
                                        },
                                        null,
                                        2,
                                    )}
                                </pre>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 style={sectionTitleStyle}>AI agent</h3>
                        <p style={sectionDescStyle}>
                            Prompts sent here use the normal AI API with the
                            embed JWT header and run as the embed write user.
                        </p>
                        {hasRequiredConfig ? (
                            <div style={dashboardContainerStyle}>
                                <Lightdash.AiAgent
                                    key={`${remountKey}:${agentUuid}`}
                                    instanceUrl={instanceUrl}
                                    token={token}
                                    agentUuid={agentUuid.trim()}
                                />
                            </div>
                        ) : (
                            <div style={emptyStateStyle}>
                                <div style={emptyStateBoxStyle}>
                                    Add an agent UUID to render the AI agent
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

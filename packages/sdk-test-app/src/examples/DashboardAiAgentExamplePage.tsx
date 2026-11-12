import Lightdash from '@lightdash/sdk';
import { ExampleLayout } from '../components/ExampleLayout';
import { parseEmbedUrl, type EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import { emptyStateBoxStyle, emptyStateStyle } from '../styles';
import {
    dashboardContainerStyle,
    sectionDescStyle,
    sectionTitleStyle,
} from './PaletteUuidExamplePage.styles';

type DashboardAiAgentExamplePageProps = {
    embedConfig: EmbedConfigState;
};

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/DashboardAiAgentExamplePage.tsx',
);

const aiAgentEmbedUrl = import.meta.env.VITE_AI_AGENT_EMBED_URL ?? '';
const aiAgentEmbedConfig = parseEmbedUrl(aiAgentEmbedUrl);
const agentUuid = aiAgentEmbedUrl.match(/\/ai-agents\/([^/#]+)/)?.[1] ?? null;

const getDashboardUuid = (embedConfig: EmbedConfigState): string | null => {
    const content = embedConfig.parsedJwt?.payload.content;
    if (
        content &&
        typeof content === 'object' &&
        'dashboardUuid' in content &&
        typeof content.dashboardUuid === 'string'
    ) {
        return content.dashboardUuid;
    }
    return null;
};

export function DashboardAiAgentExamplePage({
    embedConfig,
}: DashboardAiAgentExamplePageProps) {
    const dashboardUuid = getDashboardUuid(embedConfig);
    const agentInstanceUrl =
        aiAgentEmbedConfig.instanceUrl ?? embedConfig.instanceUrl;
    const agentToken = aiAgentEmbedConfig.token;

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Dashboard with AI agent demo"
            description={
                <>
                    A <code>Lightdash.Dashboard</code> next to a native{' '}
                    <code>Lightdash.AiAgent</code> bound to it. Questions carry
                    the filters, parameters, date zoom and tab on screen.
                </>
            }
        >
            {embedConfig.instanceUrl &&
            embedConfig.token &&
            dashboardUuid &&
            agentInstanceUrl &&
            agentToken &&
            agentUuid ? (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
                        gap: 16,
                    }}
                >
                    <section>
                        <h3 style={sectionTitleStyle}>Dashboard</h3>
                        <p style={sectionDescStyle}>
                            Uses the dashboard token from{' '}
                            <strong>Config</strong>.
                        </p>
                        <div style={dashboardContainerStyle}>
                            <Lightdash.Dashboard
                                key={embedConfig.remountKey}
                                instanceUrl={embedConfig.instanceUrl}
                                token={embedConfig.token}
                            />
                        </div>
                    </section>
                    <section>
                        <h3 style={sectionTitleStyle}>AI agent</h3>
                        <p style={sectionDescStyle}>
                            Uses <code>VITE_AI_AGENT_EMBED_URL</code>, bound to
                            the dashboard.
                        </p>
                        <div style={{ ...dashboardContainerStyle, height: 800 }}>
                            <Lightdash.AiAgent
                                renderMode="native"
                                instanceUrl={agentInstanceUrl}
                                token={agentToken}
                                agentUuid={agentUuid}
                                binding={{ type: 'dashboard', dashboardUuid }}
                            />
                        </div>
                    </section>
                </div>
            ) : (
                <div style={emptyStateStyle}>
                    <div style={emptyStateBoxStyle}>
                        Set a dashboard embed URL in <strong>Config</strong> and{' '}
                        <code>VITE_AI_AGENT_EMBED_URL</code> to an AI agent
                        embed URL
                    </div>
                </div>
            )}
        </ExampleLayout>
    );
}

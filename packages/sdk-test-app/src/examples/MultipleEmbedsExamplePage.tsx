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

type MultipleEmbedsExamplePageProps = {
    embedConfig: EmbedConfigState;
};

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/MultipleEmbedsExamplePage.tsx',
);

const chartEmbedConfig = parseEmbedUrl(
    import.meta.env.VITE_CHART_EMBED_URL ?? '',
);

const getChartIdFromToken = (token: string | null): string | null => {
    const payload = token?.split('.')[1];
    if (!payload) return null;
    try {
        const decoded = JSON.parse(
            atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
        );
        return decoded?.content?.contentId ?? null;
    } catch {
        return null;
    }
};

export function MultipleEmbedsExamplePage({
    embedConfig,
}: MultipleEmbedsExamplePageProps) {
    const chartToken = chartEmbedConfig.token;
    const chartId = getChartIdFromToken(chartToken);
    const chartInstanceUrl =
        chartEmbedConfig.instanceUrl ?? embedConfig.instanceUrl;

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Multiple embeds demo"
            description={
                <>
                    A <code>Lightdash.Dashboard</code> and a{' '}
                    <code>Lightdash.Chart</code> on the same page, each with its
                    own embed token. Every component sends its own token, so
                    both load and stay interactive.
                </>
            }
        >
            {embedConfig.instanceUrl &&
            embedConfig.token &&
            chartInstanceUrl &&
            chartToken &&
            chartId ? (
                <>
                    <section>
                        <h3 style={sectionTitleStyle}>Chart</h3>
                        <p style={sectionDescStyle}>
                            Uses the <code>VITE_CHART_EMBED_URL</code> token.
                        </p>
                        <div
                            style={{ ...dashboardContainerStyle, height: 400 }}
                        >
                            <Lightdash.Chart
                                instanceUrl={chartInstanceUrl}
                                token={chartToken}
                                id={chartId}
                            />
                        </div>
                    </section>
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
                </>
            ) : (
                <div style={emptyStateStyle}>
                    <div style={emptyStateBoxStyle}>
                        Set a dashboard embed URL in <strong>Config</strong> and{' '}
                        <code>VITE_CHART_EMBED_URL</code> to a chart embed URL
                    </div>
                </div>
            )}
        </ExampleLayout>
    );
}

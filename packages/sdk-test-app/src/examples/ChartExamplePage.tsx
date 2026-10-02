import Lightdash from '@lightdash/sdk';
import { useState } from 'react';
import { ExampleLayout } from '../components/ExampleLayout';
import {
    parseEmbedUrl,
    type EmbedConfigState,
} from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import { emptyStateBoxStyle, emptyStateStyle } from '../styles';
import {
    dashboardContainerStyle,
    sectionDescStyle,
    sectionTitleStyle,
} from './PaletteUuidExamplePage.styles';

type ChartExamplePageProps = {
    embedConfig: EmbedConfigState;
};

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/ChartExamplePage.tsx',
);

const defaultChartEmbedUrl = import.meta.env.VITE_CHART_EMBED_URL ?? '';

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

export function ChartExamplePage({ embedConfig }: ChartExamplePageProps) {
    const chartEmbedConfig = parseEmbedUrl(defaultChartEmbedUrl);
    const instanceUrl = chartEmbedConfig.instanceUrl ?? embedConfig.instanceUrl;
    const token = chartEmbedConfig.token ?? embedConfig.token;
    const chartId = getChartIdFromToken(token);
    const [isEditMode, setIsEditMode] = useState(false);
    const [exploredChart, setExploredChart] = useState<string | null>(null);

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Chart demo"
            description={
                <>
                    This example embeds a single saved chart with{' '}
                    <code>Lightdash.Chart</code> and an explicit{' '}
                    <code>isEditMode</code>. Click a data point and choose{' '}
                    <strong>Drill into</strong> to drill down without leaving
                    the host application.
                </>
            }
        >
            {instanceUrl && token && chartId ? (
                <section>
                    <h3 style={sectionTitleStyle}>Chart</h3>
                    <p style={sectionDescStyle}>
                        The JWT must use <code>content.type = "chart"</code>{' '}
                        and include write actions whose space holds the chart.{' '}
                        <button onClick={() => setIsEditMode((v) => !v)}>
                            {isEditMode ? 'Switch to view' : 'Switch to edit'}
                        </button>
                        {exploredChart && (
                            <>
                                {' '}
                                Host <code>onExplore</code> called with{' '}
                                <code>{exploredChart}</code>
                            </>
                        )}
                    </p>
                    <div style={dashboardContainerStyle}>
                        <Lightdash.Chart
                            key={defaultChartEmbedUrl || embedConfig.remountKey}
                            instanceUrl={instanceUrl}
                            token={token}
                            id={chartId}
                            isEditMode={isEditMode}
                            onExplore={({ chart }) =>
                                setExploredChart(chart.uuid)
                            }
                        />
                    </div>
                </section>
            ) : (
                <div style={emptyStateStyle}>
                    <div style={emptyStateBoxStyle}>
                        Set <code>VITE_CHART_EMBED_URL</code> or use{' '}
                        <strong>Config</strong> to add a chart embed URL
                    </div>
                </div>
            )}
        </ExampleLayout>
    );
}

import Lightdash from '@lightdash/sdk';
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

type MetricsCatalogExamplePageProps = {
    embedConfig: EmbedConfigState;
};

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/MetricsCatalogExamplePage.tsx',
);

const defaultMetricsCatalogEmbedUrl =
    import.meta.env.VITE_METRICS_CATALOG_EMBED_URL ?? '';

export function MetricsCatalogExamplePage({
    embedConfig,
}: MetricsCatalogExamplePageProps) {
    const metricsCatalogEmbedConfig = parseEmbedUrl(
        defaultMetricsCatalogEmbedUrl,
    );
    const instanceUrl =
        metricsCatalogEmbedConfig.instanceUrl ?? embedConfig.instanceUrl;
    const token = metricsCatalogEmbedConfig.token ?? embedConfig.token;
    const remountKey = defaultMetricsCatalogEmbedUrl || embedConfig.remountKey;

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Metrics catalog demo"
            description={
                <>
                    This example embeds the project metrics catalog with{' '}
                    <code>Lightdash.MetricsCatalog</code>. Select a metric to
                    preview it, then continue into the embedded Explore without
                    leaving the host application.
                </>
            }
        >
            {instanceUrl && token ? (
                <section>
                    <h3 style={sectionTitleStyle}>Metrics catalog</h3>
                    <p style={sectionDescStyle}>
                        The JWT must use{' '}
                        <code>content.type = "metricsCatalog"</code>. Set{' '}
                        <code>content.canExplore</code> to enable Explore, and
                        include write actions with a space UUID to enable chart
                        creation for an authorized actor.
                    </p>
                    <div style={dashboardContainerStyle}>
                        <Lightdash.MetricsCatalog
                            key={remountKey}
                            instanceUrl={instanceUrl}
                            token={token}
                        />
                    </div>
                </section>
            ) : (
                <div style={emptyStateStyle}>
                    <div style={emptyStateBoxStyle}>
                        Set <code>VITE_METRICS_CATALOG_EMBED_URL</code> or use{' '}
                        <strong>Config</strong> to add a metrics catalog embed
                        URL
                    </div>
                </div>
            )}
        </ExampleLayout>
    );
}

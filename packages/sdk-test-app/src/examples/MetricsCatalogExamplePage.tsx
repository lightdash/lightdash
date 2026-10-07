import Lightdash from '@lightdash/sdk';
import {
    CompiledSqlScopeSelect,
    useCompiledSqlScope,
} from '../components/CompiledSqlScopeSelect';
import { ExampleLayout } from '../components/ExampleLayout';
import { parseEmbedUrl, type EmbedConfigState } from '../hooks/useEmbedConfig';
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
const noSqlMetricsCatalogEmbedUrl =
    import.meta.env.VITE_METRICS_CATALOG_NO_SQL_EMBED_URL ?? '';

export function MetricsCatalogExamplePage({
    embedConfig,
}: MetricsCatalogExamplePageProps) {
    const compiledSqlScope = useCompiledSqlScope(
        defaultMetricsCatalogEmbedUrl,
        noSqlMetricsCatalogEmbedUrl,
    );
    const metricsCatalogEmbedConfig = parseEmbedUrl(compiledSqlScope.embedUrl);
    const instanceUrl =
        metricsCatalogEmbedConfig.instanceUrl ?? embedConfig.instanceUrl;
    const token = metricsCatalogEmbedConfig.token ?? embedConfig.token;
    const remountKey = compiledSqlScope.embedUrl || embedConfig.remountKey;

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
                        creation for an authorized actor. This example hides the
                        Owners filter with{' '}
                        <code>hiddenFilters={"{['owners']}"}</code>.
                    </p>
                    <CompiledSqlScopeSelect
                        envVarName="VITE_METRICS_CATALOG_NO_SQL_EMBED_URL"
                        isWithoutScopeAvailable={
                            compiledSqlScope.isWithoutScopeAvailable
                        }
                        scope={compiledSqlScope.scope}
                        onChange={compiledSqlScope.setScope}
                    />
                    <div style={dashboardContainerStyle}>
                        <Lightdash.MetricsCatalog
                            key={remountKey}
                            instanceUrl={instanceUrl}
                            token={token}
                            hiddenFilters={['owners']}
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

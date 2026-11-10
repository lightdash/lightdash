import Lightdash from '@lightdash/sdk';
import { useEffect, useState } from 'react';
import { ExampleLayout } from '../components/ExampleLayout';
import { ExampleSelect } from '../components/ExampleSelect';
import { parseEmbedUrl, type EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import { emptyStateBoxStyle, emptyStateStyle } from '../styles';
import {
    dashboardContainerStyle,
    sectionDescStyle,
    sectionTitleStyle,
} from './PaletteUuidExamplePage.styles';

type DashboardBuilderExamplePageProps = {
    embedConfig: EmbedConfigState;
};

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/DashboardBuilderExamplePage.tsx',
);

const sourceSpacesEmbedUrl =
    import.meta.env.VITE_DASHBOARD_BUILDER_SOURCE_SPACES_EMBED_URL ?? '';

type ChartSources = 'write-space' | 'source-spaces';

const CHART_SOURCE_OPTIONS = [
    { label: 'Write space only', value: 'write-space' },
    {
        label: 'Write space and writeActions.sourceSpaceUuids',
        value: 'source-spaces',
    },
];

export function DashboardBuilderExamplePage({
    embedConfig,
}: DashboardBuilderExamplePageProps) {
    const [isEditMode, setIsEditMode] = useState(false);
    const [isDashboardReady, setIsDashboardReady] = useState(false);
    const [chartSources, setChartSources] =
        useState<ChartSources>('write-space');
    const sourceSpacesEmbedConfig = parseEmbedUrl(sourceSpacesEmbedUrl);
    const isSourceSpaces = chartSources === 'source-spaces';
    const instanceUrl = isSourceSpaces
        ? sourceSpacesEmbedConfig.instanceUrl
        : embedConfig.instanceUrl;
    const token = isSourceSpaces
        ? sourceSpacesEmbedConfig.token
        : embedConfig.token;
    const remountKey = isSourceSpaces
        ? sourceSpacesEmbedUrl
        : embedConfig.remountKey;

    useEffect(() => {
        setIsEditMode(false);
        setIsDashboardReady(false);
    }, [remountKey]);

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Dashboard builder demo"
            description={
                <>
                    This example creates a new embedded dashboard in the
                    configured <code>writeActions.spaceUuid</code>, then lets
                    the embedded user add saved charts from that space, or from
                    the extra <code>writeActions.sourceSpaceUuids</code>, and
                    save layout changes.
                </>
            }
        >
            {instanceUrl && token ? (
                <section>
                    <h3 style={sectionTitleStyle}>New dashboard</h3>
                    <p style={sectionDescStyle}>
                        The SDK creates an empty dashboard on mount. Toggle edit
                        mode, add a saved chart, move or resize tiles, then
                        save.
                    </p>
                    <div style={{ maxWidth: '360px', marginBottom: '20px' }}>
                        <ExampleSelect
                            label="Chart sources"
                            value={chartSources}
                            disabled={!sourceSpacesEmbedUrl}
                            onChange={(value) =>
                                setChartSources(
                                    value === 'source-spaces'
                                        ? 'source-spaces'
                                        : 'write-space',
                                )
                            }
                            options={CHART_SOURCE_OPTIONS}
                            helperText={
                                sourceSpacesEmbedUrl
                                    ? 'Source space charts can be added to the dashboard but stay read-only.'
                                    : 'Run generate-embed-token to set VITE_DASHBOARD_BUILDER_SOURCE_SPACES_EMBED_URL.'
                            }
                        />
                    </div>
                    {isDashboardReady && !isEditMode && (
                        <button
                            type="button"
                            onClick={() => setIsEditMode(true)}
                            style={{
                                marginBottom: 12,
                                padding: '8px 12px',
                                borderRadius: 6,
                                border: '1px solid #ced4da',
                                background: '#fff',
                                cursor: 'pointer',
                            }}
                        >
                            Edit dashboard
                        </button>
                    )}
                    <div style={dashboardContainerStyle}>
                        <Lightdash.DashboardBuilder
                            key={remountKey}
                            instanceUrl={instanceUrl}
                            token={token}
                            isEditMode={isEditMode}
                            onEditModeChange={setIsEditMode}
                            onDashboardReady={() => setIsDashboardReady(true)}
                        />
                    </div>
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

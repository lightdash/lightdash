import Lightdash from '@lightdash/sdk';
import { useState } from 'react';
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

type ExploreFromHereExamplePageProps = {
    embedConfig: EmbedConfigState;
};

type HostMode = 'embed' | 'host';

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/ExploreFromHereExamplePage.tsx',
);

const exploreFromHereEmbedUrl =
    import.meta.env.VITE_EXPLORE_FROM_HERE_EMBED_URL ?? '';

const HOST_MODE_OPTIONS = [
    { value: 'embed', label: 'No onExplore (open inside the embed)' },
    { value: 'host', label: 'Host onExplore (host takes over)' },
];

export function ExploreFromHereExamplePage({
    embedConfig,
}: ExploreFromHereExamplePageProps) {
    const parsed = parseEmbedUrl(exploreFromHereEmbedUrl);
    const instanceUrl = parsed.instanceUrl ?? embedConfig.instanceUrl;
    const token = parsed.token ?? embedConfig.token;
    const [hostMode, setHostMode] = useState<HostMode>('embed');
    const [hostExploredChart, setHostExploredChart] = useState<{
        uuid: string;
        name: string;
    } | null>(null);

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Explore from here demo"
            description={
                <>
                    Open a tile menu and choose{' '}
                    <strong>Explore from here</strong>. Without{' '}
                    <code>onExplore</code>, the saved chart opens inside the
                    embedded dashboard with a back button. With{' '}
                    <code>onExplore</code>, the host app receives the chart
                    instead.
                </>
            }
        >
            {instanceUrl && token ? (
                <section>
                    <h3 style={sectionTitleStyle}>Dashboard</h3>
                    <p style={sectionDescStyle}>
                        The JWT must set <code>content.canExplore = true</code>{' '}
                        for the button to show.
                    </p>
                    <ExampleSelect
                        label="Host onExplore"
                        value={hostMode}
                        onChange={(value) => {
                            setHostMode(value as HostMode);
                            setHostExploredChart(null);
                        }}
                        options={HOST_MODE_OPTIONS}
                    />
                    {hostExploredChart && (
                        <p
                            style={sectionDescStyle}
                            data-testid="host-explore-result"
                        >
                            Host <code>onExplore</code> called with{' '}
                            <strong>{hostExploredChart.name}</strong> (
                            <code>{hostExploredChart.uuid}</code>)
                        </p>
                    )}
                    <div style={dashboardContainerStyle}>
                        <Lightdash.Dashboard
                            key={`${hostMode}:${embedConfig.remountKey}`}
                            instanceUrl={instanceUrl}
                            token={token}
                            onExplore={
                                hostMode === 'host'
                                    ? ({ chart }) =>
                                          setHostExploredChart({
                                              uuid: chart.uuid,
                                              name: chart.name,
                                          })
                                    : undefined
                            }
                        />
                    </div>
                </section>
            ) : (
                <div style={emptyStateStyle}>
                    <div style={emptyStateBoxStyle}>
                        Set <code>VITE_EXPLORE_FROM_HERE_EMBED_URL</code> or use{' '}
                        <strong>Config</strong> to add a dashboard embed URL
                        with <code>canExplore</code>
                    </div>
                </div>
            )}
        </ExampleLayout>
    );
}

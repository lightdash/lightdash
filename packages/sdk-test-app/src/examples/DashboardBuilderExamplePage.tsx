import Lightdash from '@lightdash/sdk';
import { useEffect, useState } from 'react';
import { ExampleLayout } from '../components/ExampleLayout';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
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

export function DashboardBuilderExamplePage({
    embedConfig,
}: DashboardBuilderExamplePageProps) {
    const [isEditMode, setIsEditMode] = useState(false);
    const [isDashboardReady, setIsDashboardReady] = useState(false);

    useEffect(() => {
        setIsEditMode(false);
        setIsDashboardReady(false);
    }, [embedConfig.remountKey]);

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Dashboard builder demo"
            description={
                <>
                    This example creates a new embedded dashboard in the
                    configured <code>writeActions.spaceUuid</code>, then lets
                    the embedded user add saved charts from that same space and
                    save layout changes.
                </>
            }
        >
            {embedConfig.instanceUrl && embedConfig.token ? (
                <section>
                    <h3 style={sectionTitleStyle}>New dashboard</h3>
                    <p style={sectionDescStyle}>
                        The SDK creates an empty dashboard on mount. Toggle edit
                        mode, add a saved chart, move or resize tiles, then
                        save.
                    </p>
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
                            key={embedConfig.remountKey}
                            instanceUrl={embedConfig.instanceUrl}
                            token={embedConfig.token}
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

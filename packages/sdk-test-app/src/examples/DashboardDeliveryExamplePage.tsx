import Lightdash from '@lightdash/sdk';
import { ExampleLayout } from '../components/ExampleLayout';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import { emptyStateBoxStyle, emptyStateStyle } from '../styles';

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/DashboardDeliveryExamplePage.tsx',
);

export function DashboardDeliveryExamplePage({
    embedConfig,
}: {
    embedConfig: EmbedConfigState;
}) {
    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Dashboard delivery demo"
            description="Send the embedded dashboard as an image report to an email destination preset in the signed embed token."
        >
            {embedConfig.instanceUrl && embedConfig.token ? (
                <div style={{ maxWidth: '360px' }}>
                    <Lightdash.DashboardDelivery
                        key={embedConfig.remountKey}
                        instanceUrl={embedConfig.instanceUrl}
                        token={embedConfig.token}
                    />
                </div>
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

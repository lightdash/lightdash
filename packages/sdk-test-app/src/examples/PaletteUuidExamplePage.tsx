import Lightdash from '@lightdash/sdk';
import { useState } from 'react';
import { ExampleLayout } from '../components/ExampleLayout';
import { ExampleSelect } from '../components/ExampleSelect';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import { emptyStateBoxStyle, emptyStateStyle } from '../styles';
import {
    dashboardContainerStyle,
    filterPanelGridStyle,
    helperTextStyle,
    infoBoxStyle,
    panelLabelStyle,
    sectionDescStyle,
    sectionTitleStyle,
} from './PaletteUuidExamplePage.styles';

type PaletteUuidExamplePageProps = {
    embedConfig: EmbedConfigState;
};

const DEFAULT_OPTION = 'default';
const SEEDED_PALETTE_OPTIONS = [
    {
        value: DEFAULT_OPTION,
        label: 'Default dashboard colors',
    },
    {
        value: '53eac606-b655-4edc-a9e9-a702e2c68f63',
        label: 'Customer Segments Sunrise',
    },
    {
        value: '0150adb1-6aba-45b8-b8e6-1e24f6d6164c',
        label: 'Customer Segments Aurora',
    },
] as const;
const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/PaletteUuidExamplePage.tsx',
);

export function PaletteUuidExamplePage({
    embedConfig,
}: PaletteUuidExamplePageProps) {
    const [selectedPaletteUuid, setSelectedPaletteUuid] =
        useState(DEFAULT_OPTION);
    const paletteUuid =
        selectedPaletteUuid === DEFAULT_OPTION
            ? undefined
            : selectedPaletteUuid;
    const selectedPaletteLabel =
        SEEDED_PALETTE_OPTIONS.find(
            (palette) => palette.value === selectedPaletteUuid,
        )?.label ?? 'Default dashboard colors';

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Palette UUID demo"
            description={
                <>
                    This example shows how a host app can point{' '}
                    <code>Lightdash.Dashboard</code> at a specific org color
                    palette by UUID. You can get palette UUIDs from{' '}
                    <strong>Settings → Appearance</strong> or fetch the
                    available palettes from the
                    <code> /api/v1/org/color-palettes</code> API.
                </>
            }
        >
            {embedConfig.instanceUrl && embedConfig.token ? (
                <>
                    <section>
                        <h3 style={sectionTitleStyle}>Palette selector</h3>

                        <div style={filterPanelGridStyle}>
                            <div>
                                <ExampleSelect
                                    label="Palette"
                                    value={selectedPaletteUuid}
                                    onChange={setSelectedPaletteUuid}
                                    options={[...SEEDED_PALETTE_OPTIONS]}
                                    helperText="These options would usually come from Appearance settings or the org palettes API."
                                />
                            </div>

                            <div>
                                <label style={panelLabelStyle}>
                                    Current dashboard prop
                                </label>
                                <pre style={infoBoxStyle}>
                                    {JSON.stringify(
                                        {
                                            palette: selectedPaletteLabel,
                                            paletteUuid: paletteUuid ?? null,
                                        },
                                        null,
                                        2,
                                    )}
                                </pre>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 style={sectionTitleStyle}>Dashboard</h3>
                        <p style={sectionDescStyle}>
                            The embedded dashboard below is rendered with the
                            selected palette UUID. In your own app, pass the
                            UUID returned by Appearance settings or by
                            <code> /api/v1/org/color-palettes</code>.
                        </p>
                        <div style={dashboardContainerStyle}>
                            <Lightdash.Dashboard
                                key={`${embedConfig.remountKey}:${selectedPaletteUuid}`}
                                instanceUrl={embedConfig.instanceUrl}
                                token={embedConfig.token}
                                {...(paletteUuid ? { paletteUuid } : {})}
                                styles={{
                                    backgroundColor: 'transparent',
                                }}
                            />
                        </div>
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

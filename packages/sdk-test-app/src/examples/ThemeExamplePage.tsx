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
    infoBoxStyle,
    panelLabelStyle,
    sectionDescStyle,
    sectionTitleStyle,
} from './PaletteUuidExamplePage.styles';

type ThemeExamplePageProps = {
    embedConfig: EmbedConfigState;
};

const THEME_OPTIONS = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
] as const;

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/ThemeExamplePage.tsx',
);

export function ThemeExamplePage({ embedConfig }: ThemeExamplePageProps) {
    const [theme, setTheme] = useState<'light' | 'dark'>('light');

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Theme demo"
            description={
                <>
                    This example shows how to switch the embedded{' '}
                    <code>Lightdash.Dashboard</code> between light and dark mode
                    via the <code>theme</code> prop. The host app picks the
                    value — typically based on its own theme state — and the
                    SDK applies the matching Mantine color scheme.
                </>
            }
        >
            {embedConfig.instanceUrl && embedConfig.token ? (
                <>
                    <section>
                        <h3 style={sectionTitleStyle}>Theme selector</h3>

                        <div style={filterPanelGridStyle}>
                            <div>
                                <ExampleSelect
                                    label="Theme"
                                    value={theme}
                                    onChange={(value) =>
                                        setTheme(value as 'light' | 'dark')
                                    }
                                    options={[...THEME_OPTIONS]}
                                    helperText="In a real host app, this would match the parent app's light/dark setting."
                                />
                            </div>

                            <div>
                                <label style={panelLabelStyle}>
                                    Current dashboard prop
                                </label>
                                <pre style={infoBoxStyle}>
                                    {JSON.stringify({ theme }, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 style={sectionTitleStyle}>Dashboard</h3>
                        <p style={sectionDescStyle}>
                            The embedded dashboard below re-renders when the
                            theme changes.
                        </p>
                        <div style={dashboardContainerStyle}>
                            <Lightdash.Dashboard
                                key={`${embedConfig.remountKey}:${theme}`}
                                instanceUrl={embedConfig.instanceUrl}
                                token={embedConfig.token}
                                theme={theme}
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

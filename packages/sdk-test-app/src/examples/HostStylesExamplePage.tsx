import Lightdash from '@lightdash/sdk';
import { useEffect, useState } from 'react';
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

type HostStylesExamplePageProps = {
    embedConfig: EmbedConfigState;
};

const THEME_OPTIONS = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
] as const;

// Deliberately low-specificity host rules: this is what a customer stylesheet
// looks like, and what the SDK's global styles used to override.
const HOST_CSS = `
.host-sample a { color: deeppink; }
.host-sample p { font-family: Georgia, serif; font-size: 18px; margin: 24px 0; }
.host-sample strong { font-weight: 900; }
.host-sample button, .host-sample select { font-family: 'Courier New', monospace; text-transform: uppercase; }
`;

const readHostProbe = () => {
    const html = document.documentElement;
    const body = document.body;
    const bodyStyle = getComputedStyle(body);
    const attributes = (element: Element) =>
        Object.fromEntries(
            [...element.attributes].map((attr) => [attr.name, attr.value]),
        );
    // Lightdash stylesheets reference --mantine-*/--ld-* variables; the host's
    // own document-level rules (like this page's reset) are not counted.
    const leakedRules = [...document.querySelectorAll('style')].filter(
        (style) =>
            /--(mantine|ld)-/.test(style.textContent ?? '') &&
            /(^|})\s*(html|body|:root|\*|p|a|strong)\s*[{,]/.test(
                style.textContent ?? '',
            ),
    ).length;
    return {
        htmlAttributes: attributes(html),
        bodyAttributes: attributes(body),
        bodyColorScheme: getComputedStyle(html).colorScheme,
        bodyFontFamily: bodyStyle.fontFamily.slice(0, 60),
        bodyBackground: bodyStyle.backgroundColor,
        styleTagsWithDocumentRules: leakedRules,
        sdkPortalNodes: document.querySelectorAll('body > .ld-sdk-portal')
            .length,
    };
};

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/HostStylesExamplePage.tsx',
);

export function HostStylesExamplePage({
    embedConfig,
}: HostStylesExamplePageProps) {
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [probe, setProbe] = useState(readHostProbe);

    useEffect(() => {
        const interval = window.setInterval(
            () => setProbe(readHostProbe()),
            500,
        );
        return () => window.clearInterval(interval);
    }, []);

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Host styles isolation demo"
            description={
                <>
                    A host page with its own low-specificity element styles next
                    to an embedded dashboard. The sample block below must keep
                    its pink links, serif paragraphs and uppercase controls, and
                    the readout must show nothing added to{' '}
                    <code>&lt;html&gt;</code> or <code>&lt;body&gt;</code>,
                    whichever theme the dashboard uses.
                </>
            }
        >
            <style>{HOST_CSS}</style>

            <section className="host-sample">
                <h3 style={sectionTitleStyle}>Host page sample</h3>
                <p>
                    This paragraph is styled by the host: Georgia, 18px, with
                    24px vertical margins. It has a{' '}
                    <a href="#host">pink link</a> and{' '}
                    <strong>heavy bold text</strong>.
                </p>
                <p>
                    <button type="button">Host button</button>{' '}
                    <select defaultValue="one">
                        <option value="one">Host select</option>
                        <option value="two">Second option</option>
                    </select>
                </p>
            </section>

            <section>
                <h3 style={sectionTitleStyle}>What the SDK touched</h3>
                <p style={sectionDescStyle}>
                    Live readout, refreshed every 500ms. Expected: no Mantine
                    attributes on html/body, host font and background unchanged,
                    zero style tags with document-level rules, and one portal
                    node per mounted SDK component.
                </p>
                <div style={filterPanelGridStyle}>
                    <div>
                        <ExampleSelect
                            label="Theme"
                            value={theme}
                            onChange={(value) =>
                                setTheme(value as 'light' | 'dark')
                            }
                            options={[...THEME_OPTIONS]}
                            helperText="Dark used to flip the host page's colour scheme."
                        />
                    </div>
                    <div>
                        <label style={panelLabelStyle}>Host probe</label>
                        <pre style={infoBoxStyle}>
                            {JSON.stringify(probe, null, 2)}
                        </pre>
                    </div>
                </div>
            </section>

            {embedConfig.instanceUrl && embedConfig.token ? (
                <section>
                    <h3 style={sectionTitleStyle}>Dashboard</h3>
                    <p style={sectionDescStyle}>
                        Open a filter dropdown or a chart menu to check
                        portalled content still picks up the SDK theme.
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

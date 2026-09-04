import Lightdash from '@lightdash/sdk';
import {
    Button as HostMantineButton,
    MantineProvider as HostMantineProvider,
} from '@mantine/core';
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

// Host CSS environments customers commonly embed into. Each is injected after
// the SDK's styles, the worst case for cascade ties.
const HOST_PRESET_OPTIONS = [
    { value: 'none', label: 'Plain host' },
    { value: 'tailwind', label: 'Tailwind preflight reset' },
    { value: 'bootstrap', label: 'Bootstrap reboot (CDN)' },
    { value: 'mantine', label: 'Host app that uses Mantine (dark, grape)' },
] as const;
type HostPreset = (typeof HOST_PRESET_OPTIONS)[number]['value'];

const TAILWIND_PREFLIGHT = `
*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:#e5e7eb}
html{line-height:1.5;-webkit-text-size-adjust:100%;tab-size:4;font-family:ui-sans-serif,system-ui,sans-serif}
body{margin:0;line-height:inherit}
hr{height:0;color:inherit;border-top-width:1px}
h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}
a{color:inherit;text-decoration:inherit}
b,strong{font-weight:bolder}
code,kbd,samp,pre{font-family:ui-monospace,monospace;font-size:1em}
table{text-indent:0;border-color:inherit;border-collapse:collapse}
button,input,optgroup,select,textarea{font-family:inherit;font-size:100%;font-weight:inherit;line-height:inherit;color:inherit;margin:0;padding:0}
button,select{text-transform:none}
button,[type='button'],[type='reset'],[type='submit']{-webkit-appearance:button;background-color:transparent;background-image:none}
blockquote,dl,dd,h1,h2,h3,h4,h5,h6,hr,figure,p,pre{margin:0}
fieldset{margin:0;padding:0}
ol,ul,menu{list-style:none;margin:0;padding:0}
textarea{resize:vertical}
input::placeholder,textarea::placeholder{opacity:1;color:#9ca3af}
button,[role="button"]{cursor:pointer}
img,svg,video,canvas,audio,iframe,embed,object{display:block;vertical-align:middle}
img,video{max-width:100%;height:auto}
[hidden]{display:none}
`;

const HOST_MANTINE_CSS_URL =
    'https://cdn.jsdelivr.net/npm/@mantine/core@8.3.18/styles.css';
const BOOTSTRAP_REBOOT_URL =
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap-reboot.min.css';

function HostEnvironment({
    preset,
    children,
}: {
    preset: HostPreset;
    children: React.ReactNode;
}) {
    if (preset === 'mantine') {
        // The host's own, unscoped Mantine stylesheet. Loaded from a CDN because
        // this app shares the SDK's Vite pipeline, which would scope a local
        // import; a real host bundles its own copy.
        return (
            <>
                <link rel="stylesheet" href={HOST_MANTINE_CSS_URL} />
                <HostMantineProvider
                    forceColorScheme="dark"
                    theme={{
                        primaryColor: 'grape',
                        fontFamily: 'Georgia, serif',
                    }}
                >
                    {children}
                </HostMantineProvider>
            </>
        );
    }
    return (
        <>
            {preset === 'tailwind' && <style>{TAILWIND_PREFLIGHT}</style>}
            {preset === 'bootstrap' && (
                <link rel="stylesheet" href={BOOTSTRAP_REBOOT_URL} />
            )}
            {children}
        </>
    );
}

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
    const [hostPreset, setHostPreset] = useState<HostPreset>('none');
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

            <HostEnvironment preset={hostPreset}>
                <section className="host-sample">
                    <h3 style={sectionTitleStyle}>Host page sample</h3>
                    <p>
                        This paragraph is styled by the host: Georgia, 18px,
                        with 24px vertical margins. It has a{' '}
                        <a href="#host">pink link</a> and{' '}
                        <strong>heavy bold text</strong>.
                    </p>
                    <p>
                        <button type="button">Host button</button>{' '}
                        <select defaultValue="one">
                            <option value="one">Host select</option>
                            <option value="two">Second option</option>
                        </select>
                        {hostPreset === 'mantine' && (
                            <>
                                {' '}
                                <HostMantineButton size="xs">
                                    Host Mantine button (should be grape, dark)
                                </HostMantineButton>
                            </>
                        )}
                    </p>
                </section>

                <section>
                    <h3 style={sectionTitleStyle}>What the SDK touched</h3>
                    <p style={sectionDescStyle}>
                        Live readout, refreshed every 500ms. Expected: no
                        Mantine attributes on html/body, host font and
                        background unchanged, zero style tags with
                        document-level rules, and one portal node per mounted
                        SDK component.
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
                            <ExampleSelect
                                label="Host CSS environment"
                                value={hostPreset}
                                onChange={(value) =>
                                    setHostPreset(value as HostPreset)
                                }
                                options={[...HOST_PRESET_OPTIONS]}
                                helperText="Resets are injected after the SDK's styles. Reload the page after switching away from the Mantine host."
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
            </HostEnvironment>
        </ExampleLayout>
    );
}

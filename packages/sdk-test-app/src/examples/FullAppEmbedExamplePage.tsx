import Lightdash from '@lightdash/sdk';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { ExampleLayout } from '../components/ExampleLayout';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import {
    emptyStateBoxStyle,
    emptyStateStyle,
    monoFontFamily,
    sansFontFamily,
} from '../styles';
import {
    dashboardContainerStyle,
    sectionDescStyle,
    sectionTitleStyle,
} from './PaletteUuidExamplePage.styles';

type FullAppEmbedExamplePageProps = {
    embedConfig: EmbedConfigState;
};

type Destination = {
    label: string;
    path: string;
};

type FullAppEmbedConfig = {
    instanceUrl: string;
    path: string;
    projectUuid: string;
    token: string;
};

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/FullAppEmbedExamplePage.tsx',
);

const defaultFullAppEmbedUrl = import.meta.env.VITE_FULL_APP_EMBED_URL ?? '';

const parseFullAppEmbedUrl = (value: string): FullAppEmbedConfig | null => {
    try {
        const url = new URL(value);
        const embedSegmentIndex = url.pathname.indexOf('/embed');
        const instancePath =
            embedSegmentIndex >= 0
                ? url.pathname.slice(0, embedSegmentIndex)
                : '';
        const normalizedInstancePath = instancePath.endsWith('/')
            ? instancePath
            : `${instancePath}/`;
        const projectUuid =
            url.pathname.match(/\/embed\/full-app\/([^/]+)/)?.[1] ?? null;
        const token = url.searchParams.get('token');

        if (!projectUuid || !token) {
            return null;
        }

        return {
            instanceUrl: `${url.origin}${normalizedInstancePath}`,
            path: url.searchParams.get('path') ?? '/projects',
            projectUuid,
            token,
        };
    } catch {
        return null;
    }
};

const getFullAppUrlForPath = (value: string, path: string) => {
    try {
        const url = new URL(value);
        url.searchParams.set('path', path);
        return url.toString();
    } catch {
        return value;
    }
};

const buttonStyle = (isSelected: boolean): CSSProperties => ({
    fontFamily: sansFontFamily,
    fontSize: '13px',
    fontWeight: 500,
    padding: '10px 14px',
    border: isSelected ? '1px solid #171717' : '1px solid #e5e5e5',
    borderRadius: '6px',
    backgroundColor: isSelected ? '#171717' : '#fff',
    color: isSelected ? '#fff' : '#171717',
    cursor: 'pointer',
});

const tokenSummaryStyle: CSSProperties = {
    fontFamily: monoFontFamily,
    fontSize: '12px',
    overflowX: 'auto',
    whiteSpace: 'nowrap',
    padding: '12px',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    color: '#525252',
    margin: '0 0 16px 0',
};

export function FullAppEmbedExamplePage({
    embedConfig,
}: FullAppEmbedExamplePageProps) {
    const parsedFullAppEmbed = parseFullAppEmbedUrl(defaultFullAppEmbedUrl);
    const projectUuid = parsedFullAppEmbed?.projectUuid ?? null;
    const destinations = useMemo<Destination[]>(
        () => [
            {
                label: 'Home',
                path: projectUuid ? `/projects/${projectUuid}/home` : '/projects',
            },
            {
                label: 'SQL runner',
                path: projectUuid
                    ? `/projects/${projectUuid}/sql-runner`
                    : '/projects',
            },
            {
                label: 'Settings',
                path: '/generalSettings/profile',
            },
            {
                label: 'Projects',
                path: '/projects',
            },
        ],
        [projectUuid],
    );
    const [selectedPath, setSelectedPath] = useState(
        parsedFullAppEmbed?.path ?? destinations[0].path,
    );
    const fullAppUrl = getFullAppUrlForPath(
        defaultFullAppEmbedUrl,
        selectedPath,
    );

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Full app embed demo"
            description={
                <>
                    This example embeds the normal Lightdash web app. The
                    bootstrap URL creates a regular session for a real user UUID,
                    then the iframe uses the same pages and APIs as a logged-in
                    Lightdash user.
                </>
            }
        >
            {parsedFullAppEmbed ? (
                <section>
                    <h3 style={sectionTitleStyle}>Embedded Lightdash app</h3>
                    <p style={sectionDescStyle}>
                        Switch destinations from the host app by changing the
                        bootstrap <code>path</code> parameter.
                    </p>
                    <div
                        style={{
                            display: 'flex',
                            gap: '8px',
                            flexWrap: 'wrap',
                            marginBottom: '16px',
                        }}
                    >
                        {destinations.map((destination) => (
                            <button
                                key={destination.path}
                                type="button"
                                onClick={() => setSelectedPath(destination.path)}
                                style={buttonStyle(
                                    selectedPath === destination.path,
                                )}
                            >
                                {destination.label}
                            </button>
                        ))}
                    </div>
                    <p style={tokenSummaryStyle}>{fullAppUrl}</p>
                    <div style={{ ...dashboardContainerStyle, height: '760px' }}>
                        <Lightdash.App
                            key={`${parsedFullAppEmbed.token}:${selectedPath}`}
                            instanceUrl={parsedFullAppEmbed.instanceUrl}
                            path={selectedPath}
                            projectUuid={parsedFullAppEmbed.projectUuid}
                            token={parsedFullAppEmbed.token}
                        />
                    </div>
                </section>
            ) : (
                <div style={emptyStateStyle}>
                    <div style={emptyStateBoxStyle}>
                        Set <code>VITE_FULL_APP_EMBED_URL</code> to render the
                        full app embed
                    </div>
                </div>
            )}
        </ExampleLayout>
    );
}

import {
    useLightdashContent,
    type LightdashApiClientConfig,
    type LightdashContentItem,
    type ListContentOptions,
} from '@lightdash/sdk';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ExampleLayout } from '../components/ExampleLayout';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import {
    emptyStateBoxStyle,
    emptyStateStyle,
    monoFontFamily,
} from '../styles';
import {
    sectionDescStyle,
    sectionTitleStyle,
} from './PaletteUuidExamplePage.styles';

type ContentCatalogExamplePageProps = {
    embedConfig: EmbedConfigState;
};

type JwtPayload = {
    content: {
        projectUuid: string;
    };
};

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/ContentCatalogExamplePage.tsx',
);

const EMPTY_CONTENT_ITEMS: LightdashContentItem[] = [];

const isJwtPayload = (payload: unknown): payload is JwtPayload => {
    if (typeof payload !== 'object' || payload === null) return false;
    if (!('content' in payload)) return false;

    const { content } = payload;

    return (
        typeof content === 'object' &&
        content !== null &&
        'projectUuid' in content &&
        typeof content.projectUuid === 'string' &&
        content.projectUuid.length > 0
    );
};

const hasContentType = (
    item: LightdashContentItem,
    contentType: 'chart' | 'dashboard' | 'space',
) => String(item.contentType) === contentType;

const listGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)',
    gap: '16px',
    alignItems: 'start',
};

const panelStyle: CSSProperties = {
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    backgroundColor: '#fff',
    overflow: 'hidden',
};

const panelHeaderStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 14px',
    borderBottom: '1px solid #e5e5e5',
    color: '#525252',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
};

const listItemStyle: CSSProperties = {
    display: 'flex',
    width: '100%',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 14px',
    borderBottom: '1px solid #f5f5f5',
    backgroundColor: '#fff',
    color: '#171717',
    textAlign: 'left',
};

const itemMetaStyle: CSSProperties = {
    color: '#737373',
    fontFamily: monoFontFamily,
    fontSize: '11px',
};

const itemTitleStyle: CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: 1.4,
};

const itemDescriptionStyle: CSSProperties = {
    display: 'block',
    marginTop: '4px',
    color: '#737373',
    fontSize: '12px',
    lineHeight: 1.4,
};

const selectStyle: CSSProperties = {
    width: '100%',
    minHeight: '40px',
    padding: '0 12px',
    border: '1px solid #d4d4d4',
    borderRadius: '6px',
    backgroundColor: '#fff',
    color: '#171717',
};

const toolbarStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(240px, 360px) auto',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '12px',
};

const countStyle: CSSProperties = {
    color: '#737373',
    fontFamily: monoFontFamily,
    fontSize: '12px',
};

const compactSectionTitleStyle: CSSProperties = {
    ...sectionTitleStyle,
    margin: '8px 0 6px 0',
};

const compactSectionDescStyle: CSSProperties = {
    ...sectionDescStyle,
    margin: '0 0 14px 0',
};

const getProjectUuid = (embedConfig: EmbedConfigState) =>
    isJwtPayload(embedConfig.parsedJwt?.payload)
        ? embedConfig.parsedJwt.payload.content.projectUuid
        : null;

const getCatalogErrorMessage = ({
    errorMessage,
    instanceUrl,
}: {
    errorMessage: string;
    instanceUrl: string;
}) => {
    if (errorMessage.includes('502')) {
        return `Lightdash API at ${instanceUrl} is not reachable from the SDK test app proxy.`;
    }

    return errorMessage;
};

export function ContentCatalogExamplePage({
    embedConfig,
}: ContentCatalogExamplePageProps) {
    const instanceUrl = embedConfig.instanceUrl ?? '';
    const token = embedConfig.token ?? '';
    const projectUuid = getProjectUuid(embedConfig);
    const hasRequiredConfig = !!instanceUrl && !!token && !!projectUuid;
    const apiInstanceUrl =
        import.meta.env.DEV && typeof window !== 'undefined'
            ? `${window.location.origin}/sdk-test-app-api/lightdash`
            : instanceUrl;
    const apiConfig = useMemo<LightdashApiClientConfig>(
        () => ({
            instanceUrl: apiInstanceUrl,
            projectUuid: projectUuid ?? undefined,
            auth: token
                ? {
                      type: 'embedToken',
                      token,
                  }
                : undefined,
        }),
        [apiInstanceUrl, projectUuid, token],
    );
    const contentArgs = useMemo<ListContentOptions>(
        () => ({
            projectUuids: projectUuid ? [projectUuid] : undefined,
            contentTypes: ['space', 'dashboard', 'chart'],
            page: 1,
            pageSize: 500,
            sortBy: 'name' as const,
            sortDirection: 'asc' as const,
        }),
        [projectUuid],
    );
    const contentQuery = useLightdashContent(apiConfig, contentArgs, {
        enabled: hasRequiredConfig,
    });
    const contentItems = contentQuery.data?.data ?? EMPTY_CONTENT_ITEMS;
    const spaces = useMemo(
        () => contentItems.filter((item) => hasContentType(item, 'space')),
        [contentItems],
    );
    const [selectedSpaceUuid, setSelectedSpaceUuid] = useState('');
    const selectedSpace = spaces.find(
        (space) => space.uuid === selectedSpaceUuid,
    );
    const selectedSpaceContent = useMemo(
        () =>
            contentItems.filter(
                (item) =>
                    selectedSpaceUuid.length > 0 &&
                    (item.space.uuid === selectedSpaceUuid ||
                        (hasContentType(item, 'space') &&
                            item.uuid === selectedSpaceUuid)),
            ),
        [contentItems, selectedSpaceUuid],
    );
    const dashboards = useMemo(
        () =>
            selectedSpaceContent.filter((item) =>
                hasContentType(item, 'dashboard'),
            ),
        [selectedSpaceContent],
    );
    const charts = useMemo(
        () =>
            selectedSpaceContent.filter((item) =>
                hasContentType(item, 'chart'),
            ),
        [selectedSpaceContent],
    );
    const catalogErrorMessage = contentQuery.error
        ? getCatalogErrorMessage({
              errorMessage: contentQuery.error.message,
              instanceUrl,
          })
        : null;

    useEffect(() => {
        if (spaces.length === 0) {
            setSelectedSpaceUuid('');
            return;
        }

        if (!spaces.some((space) => space.uuid === selectedSpaceUuid)) {
            setSelectedSpaceUuid(
                spaces.find(
                    (space) => 'chartCount' in space && space.chartCount > 0,
                )?.uuid ?? spaces[0].uuid,
            );
        }
    }, [selectedSpaceUuid, spaces]);

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Content catalog hooks demo"
            description={
                <>
                    This example calls <code>useLightdashContent</code> to list
                    spaces, dashboards, and charts for the configured project.
                </>
            }
        >
            {hasRequiredConfig ? (
                <section>
                    <h3 style={compactSectionTitleStyle}>Project content</h3>
                    <p style={compactSectionDescStyle}>
                        Use this as the host-app pattern: fetch content with{' '}
                        <code>useLightdashContent</code>, let the customer
                        choose a space, then render its catalog in your own UI.
                    </p>

                    <div style={toolbarStyle}>
                        <select
                            aria-label="Space"
                            value={selectedSpaceUuid}
                            disabled={
                                spaces.length === 0 || contentQuery.isLoading
                            }
                            onChange={(event) =>
                                setSelectedSpaceUuid(event.target.value)
                            }
                            style={selectStyle}
                        >
                            {spaces.length === 0 && (
                                <option value="">No spaces loaded</option>
                            )}
                            {spaces.map((space) => (
                                <option key={space.uuid} value={space.uuid}>
                                    {space.name}
                                </option>
                            ))}
                        </select>
                        <span style={countStyle}>
                            {contentQuery.isLoading
                                ? 'Loading content'
                                : `${dashboards.length} dashboards · ${charts.length} charts`}
                        </span>
                    </div>

                    {catalogErrorMessage ? (
                        <div style={emptyStateStyle}>
                            <div style={emptyStateBoxStyle}>
                                {catalogErrorMessage}
                            </div>
                        </div>
                    ) : (
                        <div style={listGridStyle}>
                            <div style={panelStyle}>
                                <div style={panelHeaderStyle}>
                                    <span>Charts</span>
                                    <span>{selectedSpace?.name}</span>
                                </div>
                                {charts.length === 0 && (
                                    <div style={emptyStateStyle}>
                                        <div style={emptyStateBoxStyle}>
                                            No charts in this space
                                        </div>
                                    </div>
                                )}
                                {charts.map((chart) => (
                                    <div key={chart.uuid} style={listItemStyle}>
                                        <span>
                                            <span style={itemTitleStyle}>
                                                {chart.name}
                                            </span>
                                            {chart.description && (
                                                <span
                                                    style={itemDescriptionStyle}
                                                >
                                                    {chart.description}
                                                </span>
                                            )}
                                        </span>
                                        <span style={itemMetaStyle}>
                                            {chart.contentType}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div style={panelStyle}>
                                <div style={panelHeaderStyle}>
                                    <span>Dashboards</span>
                                    <span>{dashboards.length}</span>
                                </div>
                                {dashboards.map((dashboard) => (
                                    <div
                                        key={dashboard.uuid}
                                        style={listItemStyle}
                                    >
                                        <span>
                                            <span style={itemTitleStyle}>
                                                {dashboard.name}
                                            </span>
                                            {dashboard.description && (
                                                <span
                                                    style={
                                                        itemDescriptionStyle
                                                    }
                                                >
                                                    {dashboard.description}
                                                </span>
                                            )}
                                        </span>
                                        <span style={itemMetaStyle}>
                                            dashboard
                                        </span>
                                    </div>
                                ))}
                                {dashboards.length === 0 && (
                                    <div style={emptyStateStyle}>
                                        <div style={emptyStateBoxStyle}>
                                            No dashboards in this space
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </section>
            ) : (
                <div style={emptyStateStyle}>
                    <div style={emptyStateBoxStyle}>
                        Click <strong>Config</strong> to add an embed URL with a
                        project UUID
                    </div>
                </div>
            )}
        </ExampleLayout>
    );
}

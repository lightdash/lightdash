import {
    assertUnreachable,
    ChartKind,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import { Anchor, Button, Text } from '@mantine/core';
import {
    IconChartBar,
    IconLayoutDashboard,
    IconTerminal2,
} from '@tabler/icons-react';
import { type FC, type MouseEvent, type ReactNode } from 'react';
import { Link, createPath, useLocation, useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { selectPreview, setPreview } from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import styles from './ContentLink.module.css';
import { ContentReferenceLink } from './ContentReferenceLink';
import { type ContentType } from './rehypeContentLinks';
import {
    isPlainLeftClick,
    useDataAppPreviewLink,
} from './useDataAppPreviewLink';

export type SqlRunnerLinkState = {
    sql: string;
    limit?: number;
};

const REFERENCE_LINK_KINDS = {
    'dashboard-link': 'dashboard',
    'data-app-link': 'data_app',
    'scheduled-delivery-link': 'scheduled_delivery',
} as const;

type ContentLinkProps = {
    contentType: ContentType | undefined;
    props: Record<string, unknown>;
    children: ReactNode;
    message: AiAgentMessageAssistant;
    projectUuid: string;
    agentUuid: string;
    sqlRunnerLinkState?: SqlRunnerLinkState | null;
    onDashboardLinkClick?: (url: string) => void;
};

export const ContentLink: FC<ContentLinkProps> = ({
    contentType,
    props,
    children,
    message,
    projectUuid,
    agentUuid,
    sqlRunnerLinkState,
    onDashboardLinkClick,
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useAiAgentStoreDispatch();
    const currentPreview = useAiAgentStoreSelector(selectPreview);
    const resourceHref = typeof props.href === 'string' ? props.href : '';
    const title = typeof props.title === 'string' ? props.title : undefined;
    const dataAppUuid =
        'data-app-uuid' in props && typeof props['data-app-uuid'] === 'string'
            ? props['data-app-uuid']
            : null;
    const dataAppPreviewLink = useDataAppPreviewLink(dataAppUuid, {
        messageUuid: message.uuid,
        threadUuid: message.threadUuid,
        projectUuid,
        agentUuid,
    });

    const handleResourceClick = (e: MouseEvent<HTMLAnchorElement>) => {
        if (!resourceHref || !isPlainLeftClick(e)) {
            return;
        }

        e.preventDefault();

        const currentPath = createPath({
            pathname: location.pathname,
            search: location.search,
        });
        const targetUrl = new URL(resourceHref, window.location.origin);
        const targetPath = createPath({
            pathname: targetUrl.pathname,
            search: targetUrl.search,
        });

        if (onDashboardLinkClick) {
            onDashboardLinkClick(targetPath);
        } else if (targetPath !== currentPath) {
            void navigate(targetPath, { viewTransition: true });
        }
    };

    if (contentType === undefined) {
        return <a {...props}>{children}</a>;
    }

    switch (contentType) {
        case 'dashboard-link':
        // Resource view URL with ?scheduler_uuid — navigating opens that
        // delivery's edit modal on the chart/dashboard page.
        case 'scheduled-delivery-link':
            return (
                <ContentReferenceLink
                    to={resourceHref || undefined}
                    kind={REFERENCE_LINK_KINDS[contentType]}
                    onClick={handleResourceClick}
                    title={title}
                >
                    {children}
                </ContentReferenceLink>
            );

        case 'data-app-link':
            return (
                <ContentReferenceLink
                    to={resourceHref || undefined}
                    kind={REFERENCE_LINK_KINDS[contentType]}
                    data-app-active={dataAppPreviewLink.isActive || undefined}
                    onClick={dataAppPreviewLink.onClick}
                    target="_blank"
                    rel="noreferrer"
                    title={title}
                >
                    {children}
                </ContentReferenceLink>
            );

        case 'chart-link': {
            const chartUuid =
                'data-chart-uuid' in props &&
                typeof props['data-chart-uuid'] === 'string'
                    ? props['data-chart-uuid']
                    : undefined;
            const chartSource =
                'data-chart-source' in props &&
                typeof props['data-chart-source'] === 'string'
                    ? props['data-chart-source']
                    : undefined;
            const chartType =
                'data-chart-type' in props &&
                typeof props['data-chart-type'] === 'string'
                    ? props['data-chart-type']
                    : undefined;

            const chartTypeKind =
                chartType &&
                Object.values(ChartKind).includes(chartType as ChartKind)
                    ? (chartType as ChartKind)
                    : ChartKind.VERTICAL_BAR;
            const href = typeof props.href === 'string' ? props.href : '';
            const isSavedChart = chartSource !== 'sql-runner' && !!chartUuid;
            const isActive =
                isSavedChart &&
                currentPreview?.type === 'savedChart' &&
                currentPreview.savedChartUuid === chartUuid;

            const handleChartClick = (e: MouseEvent<HTMLAnchorElement>) => {
                if (!isSavedChart || !chartUuid || !isPlainLeftClick(e)) {
                    return;
                }

                e.preventDefault();
                dispatch(
                    setPreview({
                        type: 'savedChart',
                        savedChartUuid: chartUuid,
                        messageUuid: message.uuid,
                        threadUuid: message.threadUuid,
                        projectUuid,
                        agentUuid,
                    }),
                );
            };

            return (
                <ContentReferenceLink
                    chartKind={chartTypeKind}
                    to={href || undefined}
                    kind="chart"
                    data-chart-active={isActive || undefined}
                    onClick={handleChartClick}
                    rel="noreferrer"
                    target="_blank"
                    title={title}
                >
                    {children}
                </ContentReferenceLink>
            );
        }

        case 'artifact-link': {
            const artifactUuid =
                'data-artifact-uuid' in props &&
                typeof props['data-artifact-uuid'] === 'string'
                    ? props['data-artifact-uuid']
                    : undefined;
            const versionUuid =
                'data-version-uuid' in props &&
                typeof props['data-version-uuid'] === 'string'
                    ? props['data-version-uuid']
                    : undefined;
            const artifactType =
                'data-artifact-type' in props &&
                typeof props['data-artifact-type'] === 'string'
                    ? props['data-artifact-type']
                    : undefined;

            const artifactIcon =
                artifactType === 'chart'
                    ? IconChartBar
                    : artifactType === 'dashboard'
                      ? IconLayoutDashboard
                      : IconChartBar;

            const isActive =
                currentPreview?.type === 'artifact' &&
                currentPreview.artifactUuid === artifactUuid &&
                currentPreview.versionUuid === versionUuid;

            return (
                <Anchor
                    component="button"
                    type="button"
                    fz="xs"
                    fw={500}
                    c="ldGray.8"
                    td="none"
                    classNames={{
                        root: styles.contentLink,
                    }}
                    data-artifact-active={isActive || undefined}
                    onClick={(e) => {
                        e.preventDefault();
                        if (artifactUuid && versionUuid) {
                            dispatch(
                                setPreview({
                                    type: 'artifact',
                                    artifactUuid,
                                    versionUuid,
                                    messageUuid: message.uuid,
                                    threadUuid: message.threadUuid,
                                    projectUuid: projectUuid,
                                    agentUuid: agentUuid,
                                }),
                            );
                        }
                    }}
                >
                    <MantineIcon
                        icon={artifactIcon}
                        size={13}
                        color="indigo.6"
                        fill="indigo.1"
                        fillOpacity={0.2}
                        stroke={1.5}
                    />

                    {/* margin is added by md package */}
                    <Text fz="xs" fw={500} m={0}>
                        {children}
                    </Text>
                </Anchor>
            );
        }

        case 'settings-link': {
            // Same-origin settings deep-link (e.g. the "link your personal
            // GitHub" nudge). Open in a new tab so the chat thread stays put,
            // using the captured relative path to keep it same-origin.
            const settingsPath =
                'data-settings-path' in props &&
                typeof props['data-settings-path'] === 'string'
                    ? props['data-settings-path']
                    : typeof props.href === 'string'
                      ? props.href
                      : undefined;

            if (!settingsPath) return <a {...props}>{children}</a>;

            return (
                <Anchor
                    component={Link}
                    to={settingsPath}
                    target="_blank"
                    rel="noreferrer"
                    title={title}
                    inherit
                >
                    {children}
                </Anchor>
            );
        }

        case 'sql-runner-link': {
            const state =
                sqlRunnerLinkState?.limit !== undefined
                    ? {
                          sql: sqlRunnerLinkState.sql,
                          limit: sqlRunnerLinkState.limit,
                      }
                    : sqlRunnerLinkState
                      ? { sql: sqlRunnerLinkState.sql }
                      : undefined;

            if (!state) return null;

            return (
                <Button
                    component={Link}
                    to={{
                        pathname: `/projects/${projectUuid}/sql-runner`,
                    }}
                    state={state}
                    data-content-link="true"
                    size="compact-xs"
                    variant="default"
                    className={styles.sqlRunnerLinkButton}
                    leftSection={<MantineIcon icon={IconTerminal2} size={13} />}
                >
                    {children}
                </Button>
            );
        }

        default:
            return assertUnreachable(
                contentType,
                `Unknown content type: ${contentType}`,
            );
    }
};

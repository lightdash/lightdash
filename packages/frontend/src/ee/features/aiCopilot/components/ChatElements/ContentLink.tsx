import { ChartKind, type AiAgentMessageAssistant } from '@lightdash/common';
import { Anchor, Button, Text } from '@mantine-8/core';
import {
    IconChartBar,
    IconLayoutDashboard,
    IconTerminal2,
} from '@tabler/icons-react';
import { type FC, type MouseEvent, type ReactNode } from 'react';
import { Link, createPath, useLocation, useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { setArtifact } from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import styles from './ContentLink.module.css';
import { ContentReferenceLink } from './ContentReferenceLink';

export type SqlRunnerLinkState = {
    sql: string;
    limit?: number;
};

type ContentLinkProps = {
    contentType: string | undefined;
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
    const dashboardHref = typeof props.href === 'string' ? props.href : '';
    const title = typeof props.title === 'string' ? props.title : undefined;
    const dispatch = useAiAgentStoreDispatch();
    const currentArtifact = useAiAgentStoreSelector(
        (state) => state.aiArtifact.artifact,
    );

    const handleDashboardClick = (e: MouseEvent<HTMLAnchorElement>) => {
        if (
            !dashboardHref ||
            e.defaultPrevented ||
            e.button !== 0 ||
            e.metaKey ||
            e.altKey ||
            e.ctrlKey ||
            e.shiftKey
        ) {
            return;
        }

        e.preventDefault();

        const currentPath = createPath({
            pathname: location.pathname,
            search: location.search,
        });
        const targetUrl = new URL(dashboardHref, window.location.origin);
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

    switch (contentType) {
        case 'dashboard-link':
            return (
                <ContentReferenceLink
                    href={dashboardHref}
                    kind="dashboard"
                    onClick={handleDashboardClick}
                    title={title}
                >
                    {children}
                </ContentReferenceLink>
            );

        case 'chart-link': {
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

            return (
                <ContentReferenceLink
                    chartKind={chartTypeKind}
                    href={
                        typeof props.href === 'string' ? props.href : undefined
                    }
                    kind="chart"
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
                currentArtifact &&
                currentArtifact.artifactUuid === artifactUuid &&
                currentArtifact.versionUuid === versionUuid;

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
                                setArtifact({
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
            return <a {...props}>{children}</a>;
    }
};

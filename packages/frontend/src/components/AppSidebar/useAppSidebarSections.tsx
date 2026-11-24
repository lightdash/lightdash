import { subject } from '@casl/ability';
import {
    FeatureFlags,
    getContentReviewRequestsPath,
    ManagedAgentRunStatus,
} from '@lightdash/common';
import { Badge, Text } from '@mantine/core';
import {
    IconAppWindow,
    IconChartAreaLine,
    IconCheckbox,
    IconFileText,
    IconFolders,
    IconHash,
    IconHome,
    IconLayoutDashboard,
    IconPuzzle,
    IconStack2,
    IconTable,
    IconTerminal2,
    IconWand,
} from '@tabler/icons-react';
import { type ReactNode } from 'react';
import { AiAgentIcon } from '../../ee/features/aiCopilot/components/AiAgentIcon';
import { useProjectAiAgentButtonVisibility } from '../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useIsCopilotEnabled } from '../../ee/features/aiCopilot/hooks/useIsCopilotEnabled';
import { useContentReviewAvailability } from '../../ee/features/contentReview/hooks/useContentReviewAvailability';
import { usePendingContentReviewCount } from '../../ee/features/contentReview/hooks/useContentReviewRequests';
import { useManagedAgentLatestRun } from '../../ee/features/managedAgent/hooks/useManagedAgentLatestRun';
import { useManagedAgentSettings } from '../../ee/features/managedAgent/hooks/useManagedAgentSettings';
import { useChartTypesEnabled } from '../../features/chartTypes/hooks/useChartTypesEnabled';
import { canOpenSemanticStudio } from '../../features/semanticStudio/permissions';
import { useContentAuthoringEnabled } from '../../hooks/useContentAuthoringEnabled';
import { useProject } from '../../hooks/useProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import classes from './AppSidebar.module.css';
import { type AppSidebarItemKey } from './appSidebarNavigation';

export type AppSidebarItem = {
    key: AppSidebarItemKey;
    label: string;
    to: string;
    icon: ReactNode;
    /** A count or status at the end of the row; the rail hides it. */
    status: ReactNode;
    onClick: (() => void) | null;
    /** The name walkthroughs know this destination by. */
    tourNav: string;
};

export type AppSidebarSection = {
    key: string;
    label: string | null;
    items: AppSidebarItem[];
};

type Args = {
    projectUuid: string | undefined;
    projectUrlIdentifier: string | undefined;
};

export const useAppSidebarSections = ({
    projectUuid,
    projectUrlIdentifier,
}: Args): AppSidebarSection[] => {
    const { user } = useApp();
    const { track } = useTracking();
    const { data: project } = useProject(projectUuid);
    const contentAuthoringEnabled = useContentAuthoringEnabled();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const showAskAi = useProjectAiAgentButtonVisibility(projectUuid);
    const chartTypesEnabled = useChartTypesEnabled();
    const { isAvailable: hasContentReview } = useContentReviewAvailability();
    const { data: pendingReviewCount = 0 } = usePendingContentReviewCount(
        projectUuid ?? '',
        hasContentReview && projectUuid !== undefined,
    );
    const { isCopilotEnabled } = useIsCopilotEnabled();
    const canManageAiAgent =
        projectUuid !== undefined &&
        (user.data?.ability.can(
            'manage',
            subject('AiAgent', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        ) ??
            false);
    const showAutopilot = isCopilotEnabled && canManageAiAgent;
    const { data: autopilotSettings } = useManagedAgentSettings({
        enabled: showAutopilot,
    });
    const { data: autopilotRun } = useManagedAgentLatestRun({
        enabled: showAutopilot && autopilotSettings?.enabled === true,
    });

    if (!projectUuid || !projectUrlIdentifier) {
        return [
            {
                key: 'main',
                label: null,
                items: [
                    {
                        key: 'home',
                        tourNav: 'home',
                        label: 'Home',
                        to: '/',
                        icon: <MantineIcon icon={IconHome} />,
                        status: null,
                        onClick: null,
                    },
                ],
            },
        ];
    }

    const ability = user.data?.ability;
    const organizationUuid = user.data?.organizationUuid;
    const can = (action: 'view' | 'manage', subjectName: string) =>
        ability?.can(
            action,
            subject(subjectName, { organizationUuid, projectUuid }),
        ) ?? false;

    const base = `/projects/${projectUrlIdentifier}`;

    const main: AppSidebarItem[] = [
        {
            key: 'home',
            tourNav: 'home',
            label: 'Home',
            to: `${base}/home`,
            icon: <MantineIcon icon={IconHome} />,
            status: null,
            onClick: null,
        },
        ...(showAskAi
            ? [
                  {
                      key: 'askAi' as const,
                      tourNav: 'ask-ai',
                      label: 'Ask AI',
                      to: `/projects/${projectUuid}/ai-agents`,
                      icon: <AiAgentIcon size={16} />,
                      status: null,
                      onClick: null,
                  },
              ]
            : []),
    ];

    const content: AppSidebarItem[] = [
        {
            key: 'spaces',
            tourNav: 'all-spaces',
            label: 'Spaces',
            to: `${base}/spaces`,
            icon: <MantineIcon icon={IconFolders} />,
            status: null,
            onClick: null,
        },
        {
            key: 'dashboards',
            tourNav: 'all-dashboards',
            label: 'Dashboards',
            to: `${base}/dashboards`,
            icon: <MantineIcon icon={IconLayoutDashboard} />,
            status: null,
            onClick: null,
        },
        {
            key: 'charts',
            tourNav: 'all-charts',
            label: 'Charts',
            to: `${base}/saved`,
            icon: <MantineIcon icon={IconChartAreaLine} />,
            status: null,
            onClick: null,
        },
        {
            key: 'documents',
            tourNav: 'all-documents',
            label: 'Documents',
            to: `${base}/documents`,
            icon: <MantineIcon icon={IconFileText} />,
            status: null,
            onClick: null,
        },
        ...(dataAppsFlag.data?.enabled === true &&
        (ability?.can('view', 'DataApp') ?? false)
            ? [
                  {
                      key: 'dataApps' as const,
                      tourNav: 'all-apps',
                      label: 'Data apps',
                      to: `/projects/${projectUuid}/apps`,
                      icon: <MantineIcon icon={IconAppWindow} />,
                      status: null,
                      onClick: null,
                  },
              ]
            : []),
    ];

    const canExplore = contentAuthoringEnabled && can('manage', 'Explore');
    const canUseSqlRunner =
        canExplore &&
        project?.provisioningSource !== 'analytics' &&
        can('manage', 'SqlRunner');
    const canViewMetrics =
        can('view', 'MetricsTree') || can('view', 'SpotlightTableConfig');

    const explore: AppSidebarItem[] = [
        ...(canExplore
            ? [
                  {
                      key: 'tables' as const,
                      tourNav: 'new-chart',
                      label: 'Tables',
                      to: `${base}/tables`,
                      icon: <MantineIcon icon={IconTable} />,
                      status: null,
                      onClick: null,
                  },
              ]
            : []),
        ...(canUseSqlRunner
            ? [
                  {
                      key: 'sqlRunner' as const,
                      tourNav: 'new-sql-runner',
                      label: 'SQL runner',
                      to: `${base}/sql-runner`,
                      icon: <MantineIcon icon={IconTerminal2} />,
                      status: null,
                      onClick: null,
                  },
              ]
            : []),
        ...(canViewMetrics
            ? [
                  {
                      key: 'metrics' as const,
                      tourNav: 'metrics',
                      label: 'Metrics',
                      to: `${base}/metrics`,
                      icon: <MantineIcon icon={IconHash} />,
                      status: null,
                      onClick: () => {
                          if (!project) return;
                          track({
                              name: EventName.METRICS_CATALOG_CLICKED,
                              properties: {
                                  userId: user.data?.userUuid,
                                  organizationId: project.organizationUuid,
                                  projectId: projectUuid,
                              },
                          });
                      },
                  },
              ]
            : []),
        ...(organizationUuid !== undefined &&
        ability !== undefined &&
        canOpenSemanticStudio(ability, organizationUuid, projectUuid)
            ? [
                  {
                      key: 'semanticLayer' as const,
                      tourNav: 'semantic-layer',
                      label: 'Semantic layer',
                      to: `/projects/${projectUuid}/semantic-layer`,
                      icon: <MantineIcon icon={IconStack2} />,
                      status: null,
                      onClick: null,
                  },
              ]
            : []),
        // The gallery list endpoint is gated on `manage Explore`.
        ...(chartTypesEnabled.enabled && can('manage', 'Explore')
            ? [
                  {
                      key: 'chartStudio' as const,
                      tourNav: 'chart-studio',
                      label: 'Chart Studio',
                      to: `${base}/chart-studio`,
                      icon: <MantineIcon icon={IconPuzzle} />,
                      status: null,
                      onClick: null,
                  },
              ]
            : []),
    ];

    const isAutopilotRunFinished =
        autopilotRun !== null &&
        autopilotRun !== undefined &&
        autopilotRun.status !== ManagedAgentRunStatus.STARTED &&
        autopilotRun.status !== ManagedAgentRunStatus.ERROR;

    const quality: AppSidebarItem[] = [
        ...(hasContentReview
            ? [
                  {
                      key: 'reviews' as const,
                      tourNav: 'reviews',
                      label: 'Reviews',
                      to: getContentReviewRequestsPath(projectUuid),
                      icon: <MantineIcon icon={IconCheckbox} />,
                      status:
                          pendingReviewCount > 0 ? (
                              <Badge
                                  size="xs"
                                  color="yellow"
                                  variant="light"
                                  circle
                              >
                                  {pendingReviewCount}
                              </Badge>
                          ) : null,
                      onClick: null,
                  },
              ]
            : []),
        ...(showAutopilot
            ? [
                  {
                      key: 'autopilot' as const,
                      tourNav: 'autopilot',
                      label: 'Autopilot',
                      to: `/projects/${projectUuid}/autopilot`,
                      icon: <MantineIcon icon={IconWand} />,
                      status: isAutopilotRunFinished ? (
                          <Text span className={classes.itemStatus}>
                              {autopilotRun.actionCount}{' '}
                              {autopilotRun.actionCount === 1
                                  ? 'action'
                                  : 'actions'}
                          </Text>
                      ) : null,
                      onClick: null,
                  },
              ]
            : []),
    ];

    return [
        { key: 'main', label: null, items: main },
        { key: 'content', label: 'Content', items: content },
        { key: 'explore', label: 'Explore', items: explore },
        { key: 'quality', label: 'Quality', items: quality },
    ].filter((section) => section.items.length > 0);
};

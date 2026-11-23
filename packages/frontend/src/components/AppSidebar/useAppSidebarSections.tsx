import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import {
    IconAppWindow,
    IconChartAreaLine,
    IconFileText,
    IconFolders,
    IconHash,
    IconHome,
    IconLayoutDashboard,
    IconTable,
    IconTerminal2,
} from '@tabler/icons-react';
import { type ReactNode } from 'react';
import { AiAgentIcon } from '../../ee/features/aiCopilot/components/AiAgentIcon';
import { useProjectAiAgentButtonVisibility } from '../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useContentAuthoringEnabled } from '../../hooks/useContentAuthoringEnabled';
import { useProject } from '../../hooks/useProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import { type AppSidebarItemKey } from './appSidebarNavigation';

export type AppSidebarItem = {
    key: AppSidebarItemKey;
    label: string;
    to: string;
    icon: ReactNode;
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
            onClick: null,
        },
        {
            key: 'dashboards',
            tourNav: 'all-dashboards',
            label: 'Dashboards',
            to: `${base}/dashboards`,
            icon: <MantineIcon icon={IconLayoutDashboard} />,
            onClick: null,
        },
        {
            key: 'charts',
            tourNav: 'all-charts',
            label: 'Charts',
            to: `${base}/saved`,
            icon: <MantineIcon icon={IconChartAreaLine} />,
            onClick: null,
        },
        {
            key: 'documents',
            tourNav: 'all-documents',
            label: 'Documents',
            to: `${base}/documents`,
            icon: <MantineIcon icon={IconFileText} />,
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

    const build: AppSidebarItem[] = [
        ...(canExplore
            ? [
                  {
                      key: 'tables' as const,
                      tourNav: 'new-chart',
                      label: 'Query from tables',
                      to: `${base}/tables`,
                      icon: <MantineIcon icon={IconTable} />,
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
    ];

    return [
        { key: 'main', label: null, items: main },
        { key: 'content', label: 'Content', items: content },
        { key: 'build', label: 'Build', items: build },
    ].filter((section) => section.items.length > 0);
};

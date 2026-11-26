import { ManagedAgentRunStatus } from '@lightdash/common';
import { Text } from '@mantine/core';
import {
    IconChartAreaLine,
    IconCheckbox,
    IconFileText,
    IconFolders,
    IconHash,
    IconHome,
    IconPuzzle,
    IconStack2,
    IconTerminal2,
    IconWand,
} from '@tabler/icons-react';
import { type ReactNode } from 'react';
import { AiAgentIcon } from '../../ee/features/aiCopilot/components/AiAgentIcon';
import { useProjectAiAgentButtonVisibility } from '../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import ReviewRequestCountBadge from '../../ee/features/contentReview/components/ReviewRequestCountBadge';
import { useReviewRequestsNav } from '../../ee/features/contentReview/hooks/useReviewRequestsNav';
import {
    formatAutopilotActionCount,
    useAutopilotNavState,
} from '../../ee/features/managedAgent/hooks/useAutopilotNavState';
import { DashboardIcon, DataAppIcon, TableIcon } from '../common/ContentIcons';
import MantineIcon from '../common/MantineIcon';
import {
    useCanExplore,
    useCanOpenSemanticStudio,
    useCanUseSqlRunner,
    useCanViewChartStudio,
    useCanViewDataApps,
    useCanViewMetrics,
    useTrackMetricsCatalogClick,
} from '../NavBar/useDestinationAccess';
import classes from './AppSidebar.module.css';
import {
    APP_SIDEBAR_ITEM_KEYS,
    APP_SIDEBAR_ITEMS,
    APP_SIDEBAR_SECTIONS,
    getAppSidebarItemUrl,
    type AppSidebarItemKey,
} from './appSidebarNavigation';

export type AppSidebarItem = {
    key: AppSidebarItemKey;
    label: string;
    to: string;
    icon: ReactNode;
    /** A count or status at the end of the row; the rail hides it. */
    status: ReactNode;
    onClick: (() => void) | null;
    tourNav: string;
};

export type AppSidebarSection = {
    key: string;
    label: string | null;
    items: AppSidebarItem[];
};

const ITEM_ICONS: Record<AppSidebarItemKey, ReactNode> = {
    home: <MantineIcon icon={IconHome} />,
    askAi: <AiAgentIcon size={16} muted />,
    spaces: <MantineIcon icon={IconFolders} />,
    dashboards: <MantineIcon icon={DashboardIcon} />,
    charts: <MantineIcon icon={IconChartAreaLine} />,
    documents: <MantineIcon icon={IconFileText} />,
    dataApps: <MantineIcon icon={DataAppIcon} />,
    tables: <MantineIcon icon={TableIcon} />,
    sqlRunner: <MantineIcon icon={IconTerminal2} />,
    metrics: <MantineIcon icon={IconHash} />,
    semanticLayer: <MantineIcon icon={IconStack2} />,
    chartStudio: <MantineIcon icon={IconPuzzle} />,
    reviews: <MantineIcon icon={IconCheckbox} />,
    autopilot: <MantineIcon icon={IconWand} />,
};

type Args = {
    projectUuid: string | undefined;
    projectUrlIdentifier: string | undefined;
};

export const useAppSidebarSections = ({
    projectUuid,
    projectUrlIdentifier,
}: Args): AppSidebarSection[] => {
    const showAskAi = useProjectAiAgentButtonVisibility(projectUuid);
    const canViewDataApps = useCanViewDataApps();
    const canExplore = useCanExplore(projectUuid);
    const canUseSqlRunner = useCanUseSqlRunner(projectUuid);
    const canViewMetrics = useCanViewMetrics(projectUuid);
    const trackMetricsCatalogClick = useTrackMetricsCatalogClick(projectUuid);
    const canOpenSemanticStudio = useCanOpenSemanticStudio(projectUuid);
    const canViewChartStudio = useCanViewChartStudio(projectUuid);
    const reviews = useReviewRequestsNav(projectUuid);
    const autopilot = useAutopilotNavState(projectUuid);

    const project =
        projectUuid && projectUrlIdentifier
            ? { projectUuid, projectUrlIdentifier }
            : null;

    const isAllowed: Record<AppSidebarItemKey, boolean> = {
        home: true,
        askAi: showAskAi,
        spaces: true,
        dashboards: true,
        charts: true,
        documents: true,
        dataApps: canViewDataApps,
        tables: canExplore,
        sqlRunner: canUseSqlRunner,
        metrics: canViewMetrics,
        semanticLayer: canOpenSemanticStudio,
        chartStudio: canViewChartStudio,
        reviews: reviews.isAvailable,
        autopilot: autopilot.isAvailable,
    };

    const autopilotRun = autopilot.latestRun;
    const isAutopilotRunFinished =
        autopilotRun !== null &&
        autopilotRun !== undefined &&
        autopilotRun.status !== ManagedAgentRunStatus.STARTED &&
        autopilotRun.status !== ManagedAgentRunStatus.ERROR;

    const statuses: Partial<Record<AppSidebarItemKey, ReactNode>> = {
        reviews:
            reviews.pendingCount > 0 ? (
                <ReviewRequestCountBadge count={reviews.pendingCount} />
            ) : null,
        autopilot: isAutopilotRunFinished ? (
            <Text span className={classes.itemStatus}>
                {formatAutopilotActionCount(autopilotRun.actionCount)}
            </Text>
        ) : null,
    };

    const clickHandlers: Partial<Record<AppSidebarItemKey, () => void>> = {
        metrics: trackMetricsCatalogClick,
    };

    // Without a project there is nowhere to go but home.
    const items = APP_SIDEBAR_ITEM_KEYS.filter(
        (key) => isAllowed[key] && (project !== null || key === 'home'),
    ).map(
        (key): AppSidebarItem => ({
            key,
            label: APP_SIDEBAR_ITEMS[key].label,
            to: project ? getAppSidebarItemUrl(key, project) : '/',
            icon: ITEM_ICONS[key],
            status: statuses[key] ?? null,
            onClick: clickHandlers[key] ?? null,
            tourNav: APP_SIDEBAR_ITEMS[key].tourNav,
        }),
    );

    return APP_SIDEBAR_SECTIONS.map((section) => ({
        ...section,
        items: items.filter(
            (item) => APP_SIDEBAR_ITEMS[item.key].section === section.key,
        ),
    })).filter((section) => section.items.length > 0);
};

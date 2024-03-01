import { subject } from '@casl/ability';
import { memo } from 'react';
import { useHistory, useParams, useRouteMatch } from 'react-router-dom';

import { ActionIcon, Group, Text } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconCircleXFilled } from '@tabler/icons-react';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import Explorer from '../components/Explorer';
import ExploreSideBar from '../components/Explorer/ExploreSideBar/index';
import ForbiddenPanel from '../components/ForbiddenPanel';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useExplore } from '../hooks/useExplore';
import {
    useDateZoomGranularitySearch,
    useExplorerRoute,
    useExplorerUrlState,
} from '../hooks/useExplorerRoute';
import { useQueryResults } from '../hooks/useQueryResults';
import { useApp } from '../providers/AppProvider';
import CustomExploreProvider from '../providers/CustomExploreProvider';
import {
    ExploreMode,
    ExplorerProvider,
    useExplorerContext,
} from '../providers/ExplorerProvider';

const ExplorerWithUrlParams = memo(() => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    useExplorerRoute();
    const mode = useExplorerContext((context) => context.state.mode);
    const tableId = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );

    const reset = useExplorerContext((context) => context.actions.reset);

    const history = useHistory();

    const { data } = useExplore(tableId);

    const { getIsEditingDashboardChart } = useDashboardStorage();

    const clearQuery = useExplorerContext(
        (context) => context.actions.clearQuery,
    );
    useHotkeys([['mod + alt + k', clearQuery]]);

    const handleExit = () => {
        reset();
        history.push(`/projects/${projectUuid}/tables`);
    };

    return (
        <Page
            title={
                mode === ExploreMode.CREATE
                    ? 'Untitled Explore'
                    : data
                    ? data?.label
                    : 'Tables'
            }
            sidebar={<ExploreSideBar />}
            withFullHeight
            withPaddedContent
            withMode={
                mode === ExploreMode.CREATE ? (
                    <Group
                        spacing="xs"
                        pos="relative"
                        top={-2}
                        style={{ pointerEvents: 'all' }}
                    >
                        <Text fw={500}>SQL mode</Text>
                        <ActionIcon size="sm" variant="transparent" c="white">
                            <MantineIcon
                                onClick={handleExit}
                                icon={IconCircleXFilled}
                                color="white"
                                fill="white"
                            />
                        </ActionIcon>
                    </Group>
                ) : undefined
            }
            hasBanner={getIsEditingDashboardChart()}
        >
            <Explorer />
        </Page>
    );
});

const ExplorerPage = memo(() => {
    const { projectUuid, tableId } = useParams<{
        projectUuid: string;
        tableId?: string;
    }>();

    const matchNew = useRouteMatch('/projects/:projectUuid/explore/new');
    const matchBuild = useRouteMatch('/projects/:projectUuid/explore/build');
    const isCreatingNewExplore = matchNew?.isExact;
    const isBuildingNewExplore = matchBuild?.isExact;

    const explorerUrlState = useExplorerUrlState();

    const { user } = useApp();

    const dateZoomGranularity = useDateZoomGranularitySearch();

    const queryResults = useQueryResults({ dateZoomGranularity });

    const cannotViewProject = user.data?.ability?.cannot(
        'view',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const cannotManageExplore = user.data?.ability?.cannot(
        'manage',
        subject('Explore', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    if (cannotViewProject || cannotManageExplore) {
        return <ForbiddenPanel />;
    }

    return (
        <CustomExploreProvider>
            <ExplorerProvider
                mode={
                    isCreatingNewExplore
                        ? ExploreMode.CREATE
                        : tableId || isBuildingNewExplore
                        ? ExploreMode.EDIT
                        : ExploreMode.INDEX
                }
                initialState={explorerUrlState}
                queryResults={queryResults}
            >
                <ExplorerWithUrlParams />
            </ExplorerProvider>
        </CustomExploreProvider>
    );
});

export default ExplorerPage;

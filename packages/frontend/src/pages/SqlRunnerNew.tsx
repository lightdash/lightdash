import { getFieldQuoteChar } from '@lightdash/common';
import { ActionIcon, Group, Paper, Tooltip } from '@mantine/core';
import { IconDatabase } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router-dom';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import { Sidebar } from '../features/sqlRunner';
import { ContentPanel } from '../features/sqlRunner/components/ContentPanel';
import { Header } from '../features/sqlRunner/components/Header';
import { RightSidebar } from '../features/sqlRunner/components/RightSidebar';
import { useSavedSqlChart } from '../features/sqlRunner/hooks/useSavedSqlCharts';
import { store } from '../features/sqlRunner/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../features/sqlRunner/store/hooks';
import {
    loadState,
    setProjectUuid,
    setQuoteChar,
    setSaveChartData,
} from '../features/sqlRunner/store/sqlRunnerSlice';
import { useProject } from '../hooks/useProject';
import useSearchParams from '../hooks/useSearchParams';
import { useGetShare } from '../hooks/useShare';

const SqlRunnerNew = () => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);

    const params = useParams<{ projectUuid: string; slug?: string }>();
    const state = useSearchParams('state');

    const { data: sqlRunnerState } = useGetShare(state || undefined);
    const [isLeftSidebarOpen, setLeftSidebarOpen] = useState(true);
    const [isRightSidebarOpen, setRightSidebarOpen] = useState(false);
    const { data: project } = useProject(projectUuid);

    useEffect(() => {
        if (sqlRunnerState) {
            dispatch(loadState(JSON.parse(sqlRunnerState.params)));
        }
    }, [dispatch, sqlRunnerState]);

    useEffect(() => {
        if (!projectUuid && params.projectUuid) {
            dispatch(setProjectUuid(params.projectUuid));
        }
    }, [dispatch, params.projectUuid, projectUuid]);

    useSavedSqlChart({
        projectUuid,
        slug: params.slug,
        onSuccess: (data) => {
            dispatch(setSaveChartData(data));
        },
    });
    useEffect(() => {
        if (project?.warehouseConnection?.type) {
            dispatch(
                setQuoteChar(
                    getFieldQuoteChar(project?.warehouseConnection?.type),
                ),
            );
        }
    }, [dispatch, project?.warehouseConnection?.type]);

    if (!projectUuid) {
        return null;
    }

    return (
        <Page
            title="SQL Runner"
            noContentPadding
            flexContent
            header={<Header />}
            isSidebarOpen={isLeftSidebarOpen}
            sidebar={<Sidebar setSidebarOpen={setLeftSidebarOpen} />}
            isRightSidebarOpen={isRightSidebarOpen}
            rightSidebar={<RightSidebar setSidebarOpen={setRightSidebarOpen} />}
        >
            <Group
                align={'stretch'}
                grow
                spacing="none"
                p={0}
                style={{ flex: 1 }}
                w="100%"
            >
                {!isLeftSidebarOpen && (
                    <Paper
                        shadow="none"
                        radius={0}
                        px="md"
                        py="lg"
                        style={{ flexGrow: 0 }}
                    >
                        <Tooltip
                            variant="xs"
                            label={'Open sidebar'}
                            position="right"
                        >
                            <ActionIcon size="xs">
                                <MantineIcon
                                    icon={IconDatabase}
                                    onClick={() => setLeftSidebarOpen(true)}
                                />
                            </ActionIcon>
                        </Tooltip>
                    </Paper>
                )}
                <ContentPanel
                    isChartConfigOpen={isRightSidebarOpen}
                    openChartConfig={() => {
                        setLeftSidebarOpen(false);
                        setRightSidebarOpen(true);
                    }}
                    closeChartConfig={() => {
                        setRightSidebarOpen(false);
                    }}
                />
            </Group>
        </Page>
    );
};

const SqlRunnerNewPage = () => {
    return (
        <Provider store={store}>
            <SqlRunnerNew />
        </Provider>
    );
};
export default SqlRunnerNewPage;

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
import { store } from '../features/sqlRunner/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../features/sqlRunner/store/hooks';
import { setProjectUuid } from '../features/sqlRunner/store/sqlRunnerSlice';

const SqlRunnerNew = () => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);

    const params = useParams<{ projectUuid: string }>();

    const [isLeftSidebarOpen, setLeftSidebarOpen] = useState(true);
    const [isRightSidebarOpen, setRightSidebarOpen] = useState(false);

    useEffect(() => {
        if (!projectUuid && params.projectUuid) {
            dispatch(setProjectUuid(params.projectUuid));
        }
    }, [dispatch, params.projectUuid, projectUuid]);

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
            >
                {!isLeftSidebarOpen && (
                    <Paper
                        shadow="none"
                        radius={0}
                        px="md"
                        py="lg"
                        withBorder
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

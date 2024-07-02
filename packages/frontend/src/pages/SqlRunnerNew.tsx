import { ActionIcon, Group, Paper, Tooltip } from '@mantine/core';
import { IconDatabase } from '@tabler/icons-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import { Sidebar } from '../features/sqlRunner';
import { ContentPanel } from '../features/sqlRunner/components/ContentPanel';
import { Header } from '../features/sqlRunner/components/Header';
import { RightSidebar } from '../features/sqlRunner/components/RightSidebar';

const SqlRunnerNewPage = () => {
    const params = useParams<{ projectUuid: string }>();
    const selectedProjectUuid = params.projectUuid;
    const [isLeftSidebarOpen, setLeftSidebarOpen] = useState(true);
    const [isRightSidebarOpen, setRightSidebarOpen] = useState(false);

    return (
        <Page
            title="SQL Runner"
            noContentPadding
            header={<Header />}
            isSidebarOpen={isLeftSidebarOpen}
            sidebar={
                <Sidebar
                    projectUuid={selectedProjectUuid}
                    setSidebarOpen={setLeftSidebarOpen}
                />
            }
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
export default SqlRunnerNewPage;

import { ActionIcon, Box, Group } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router-dom';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import { Sidebar } from '../features/sqlRunner';
import { SqlRunnerProvider } from '../features/sqlRunner/providers/SqlRunnerProvider';
import { globalActor } from '../machines';
import { store } from '../store';

// Start the actor
globalActor.start();

const SqlRunnerNewPage = () => {
    const params = useParams<{ projectUuid: string }>();
    const selectedProjectUuid = params.projectUuid;
    const [isSidebarOpen, setSidebarOpen] = useState(true);

    return (
        <Provider store={store}>
            <SqlRunnerProvider projectUuid={selectedProjectUuid}>
                <Page
                    title="SQL Runner"
                    withFullHeight
                    withPaddedContent
                    isSidebarOpen={isSidebarOpen}
                    sidebar={<Sidebar setSidebarOpen={setSidebarOpen} />}
                >
                    <Group>
                        {!isSidebarOpen && (
                            <ActionIcon size="xs">
                                <MantineIcon
                                    icon={IconArrowRight}
                                    onClick={() => setSidebarOpen(true)}
                                />
                            </ActionIcon>
                        )}
                        <Box>Sql Runner new</Box>
                    </Group>
                </Page>
            </SqlRunnerProvider>
        </Provider>
    );
};
export default SqlRunnerNewPage;

import { ActionIcon, Box, Group } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import { Sidebar } from '../features/sqlRunner';

const SqlRunnerNewPage = () => {
    const params = useParams<{ projectUuid: string }>();
    const selectedProjectUuid = params.projectUuid;
    const [isSidebarOpen, setSidebarOpen] = useState(true);

    return (
        <Page
            title="SQL Runner"
            withFullHeight
            withPaddedContent
            isSidebarOpen={isSidebarOpen}
            sidebar={
                <Sidebar
                    projectUuid={selectedProjectUuid}
                    setSidebarOpen={setSidebarOpen}
                />
            }
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
    );
};
export default SqlRunnerNewPage;

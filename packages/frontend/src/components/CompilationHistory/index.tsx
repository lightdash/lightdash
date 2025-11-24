import {
    ActionIcon,
    Card,
    Group,
    LoadingOverlay,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconRefresh } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import { useProject } from '../../hooks/useProject';
import MantineIcon from '../common/MantineIcon';
import CompilationHistoryTable from './CompilationHistoryTable';

type CompilationHistoryProps = {
    projectUuid: string;
};

const CompilationHistory: FC<CompilationHistoryProps> = ({ projectUuid }) => {
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();
    const { isLoading: isLoadingProject } = useProject(projectUuid);

    const handleRefresh = async () => {
        await queryClient.invalidateQueries([
            'projectCompileLogs',
            projectUuid,
        ]);
        showToastSuccess({
            title: 'Compilation history refreshed successfully',
        });
    };

    return (
        <>
            <LoadingOverlay visible={isLoadingProject} />

            <Card pb="xxl">
                <Stack gap="md">
                    <Group justify="space-between">
                        <Stack gap={2}>
                            <Title order={5}>Compilation History</Title>
                            <Text c="dimmed" size="xs">
                                View the history of all dbt compilations for
                                this project, including CLI deploys and UI
                                refreshes.
                            </Text>
                        </Stack>
                        <Group gap="xs"></Group>
                        <Tooltip label="Click to refresh the compilation history">
                            <ActionIcon
                                onClick={handleRefresh}
                                variant="subtle"
                                size="md"
                            >
                                <MantineIcon
                                    icon={IconRefresh}
                                    color="ldGray.6"
                                    stroke={2}
                                />
                            </ActionIcon>
                        </Tooltip>
                    </Group>

                    <CompilationHistoryTable projectUuid={projectUuid} />
                </Stack>
            </Card>
        </>
    );
};

export default CompilationHistory;

import { Button, Card, LoadingOverlay } from '@mantine-8/core';
import { IconRefresh } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import { useProject } from '../../hooks/useProject';
import MantineIcon from '../common/MantineIcon';
import { SettingsPage } from '../common/Settings/SettingsPage';
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

            <SettingsPage
                title="Compilation history"
                description="Review recent dbt compilation runs for this project."
                actions={
                    <Button
                        onClick={handleRefresh}
                        variant="default"
                        size="xs"
                        leftSection={
                            <MantineIcon icon={IconRefresh} stroke={2} />
                        }
                    >
                        Refresh
                    </Button>
                }
            >
                <Card pb="xxl">
                    <CompilationHistoryTable projectUuid={projectUuid} />
                </Card>
            </SettingsPage>
        </>
    );
};

export default CompilationHistory;

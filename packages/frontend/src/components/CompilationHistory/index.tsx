import { Button, Card, LoadingOverlay } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import useToaster from '../../hooks/toaster/useToaster';
import { useProject } from '../../hooks/useProject';
import MantineIcon from '../common/MantineIcon';
import { SettingsPage } from '../common/Settings/SettingsPage';
import CompilationHistoryTable from './CompilationHistoryTable';

type CompilationHistoryProps = {
    projectUuid: string;
};

const CompilationHistory: FC<CompilationHistoryProps> = ({ projectUuid }) => {
    const { t } = useTranslation('projectConnection');
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();
    const { isLoading: isLoadingProject } = useProject(projectUuid);

    const handleRefresh = async () => {
        await queryClient.invalidateQueries([
            'projectCompileLogs',
            projectUuid,
        ]);
        showToastSuccess({
            title: t('compilationHistory.refreshed'),
        });
    };

    return (
        <>
            <LoadingOverlay visible={isLoadingProject} />

            <SettingsPage
                title={t('compilationHistory.title')}
                description={t('compilationHistory.description')}
                actions={
                    <Button
                        onClick={handleRefresh}
                        variant="default"
                        size="xs"
                        leftSection={
                            <MantineIcon icon={IconRefresh} stroke={2} />
                        }
                    >
                        {t('compilationHistory.refresh')}
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

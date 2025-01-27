import { type ApiError, type DashboardSummary } from '@lightdash/common';
import { Button, Modal, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconWand } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState, type FC } from 'react';
import { lightdashApi } from '../../../api';
import MantineIcon from '../../../components/common/MantineIcon';
import useToaster from '../../../hooks/toaster/useToaster';
import PresetsForm from './PresetsForm';
import SummaryPreview from './SummaryPreview';

type DashboardAIProps = {
    projectUuid: string;
    dashboardUuid: string;
    dashboardVersionId: number;
};

// get
const getDashboardSummary = async (
    projectUuid: string,
    dashboardUuid: string,
) => {
    return lightdashApi<DashboardSummary>({
        url: `/ai/${projectUuid}/dashboard/${dashboardUuid}/summary`,
        method: 'GET',
        body: undefined,
    });
};

const useGetDashboardSummary = (projectUuid: string, dashboardUuid: string) =>
    useQuery<DashboardSummary, ApiError>({
        queryKey: ['ai-dashboard-summary', projectUuid, dashboardUuid],
        queryFn: () => getDashboardSummary(projectUuid, dashboardUuid),
    });

// create
const createDashboardSummary = async (
    projectUuid: string,
    dashboardUuid: string,
    params: Pick<DashboardSummary, 'context' | 'tone' | 'audiences'>,
) => {
    return lightdashApi<DashboardSummary>({
        url: `/ai/${projectUuid}/dashboard/${dashboardUuid}/summary`,
        method: 'POST',
        body: JSON.stringify(params),
    });
};

const useCreateDashboardSummary = (
    projectUuid: string,
    dashboardUuid: string,
    onError?: (error: ApiError) => void,
) =>
    useMutation<
        DashboardSummary,
        ApiError,
        Pick<DashboardSummary, 'context' | 'tone' | 'audiences'>
    >({
        mutationFn: (params) =>
            createDashboardSummary(projectUuid, dashboardUuid, params),
        onError,
    });

const AIDashboardSummary: FC<DashboardAIProps> = ({
    dashboardUuid,
    projectUuid,
    dashboardVersionId,
}) => {
    const [opened, { open, close }] = useDisclosure(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [summary, setSummary] = useState<DashboardSummary>();
    const { showToastError } = useToaster();

    const {
        data: persistedDashboardSummary,
        isInitialLoading: isPersistedDashboardSummaryLoading,
    } = useGetDashboardSummary(projectUuid, dashboardUuid);

    const {
        data: createdDashboardSummary,
        isLoading: isCreatedDashboardSummaryLoading,
        mutate: createSummary,
    } = useCreateDashboardSummary(projectUuid, dashboardUuid, (error) => {
        showToastError({
            title: 'Failed generate dashboard summary',
            subtitle: error.error.message,
        });
    });

    useEffect(() => {
        if (persistedDashboardSummary) {
            setSummary(persistedDashboardSummary);
        }
    }, [persistedDashboardSummary]);

    useEffect(() => {
        if (createdDashboardSummary) {
            setSummary(createdDashboardSummary);
        }
    }, [createdDashboardSummary]);

    useEffect(() => {
        setIsRegenerating(Boolean(isCreatedDashboardSummaryLoading));
    }, [isCreatedDashboardSummaryLoading]);

    const regenSummary = useCallback(() => {
        setIsRegenerating(true);
    }, []);

    const cancelContextInput = useCallback(() => {
        setIsRegenerating(false);

        if (!summary) {
            close();
        }
    }, [close, summary]);

    const closeModal = useCallback(() => {
        setIsRegenerating(false);
        close();
    }, [close]);

    return (
        <>
            <Modal
                opened={opened}
                onClose={closeModal}
                size="xl"
                title={
                    summary
                        ? 'Dashboard Summary'
                        : 'Generated Dashboard Summary'
                }
            >
                {summary && !isRegenerating ? (
                    <SummaryPreview
                        summary={summary}
                        handleSummaryRegen={regenSummary}
                        dashboardVersionId={dashboardVersionId}
                    />
                ) : (
                    <PresetsForm
                        summary={summary}
                        isLoading={isCreatedDashboardSummaryLoading}
                        onFormSubmit={createSummary}
                        handleCancel={cancelContextInput}
                    />
                )}
            </Modal>

            <Tooltip
                label={
                    summary
                        ? 'View dashboard summary'
                        : 'Generate a summary of your dashboard'
                }
                withinPortal
                position="bottom"
            >
                <Button
                    variant="light"
                    onClick={open}
                    leftIcon={<MantineIcon icon={IconWand} />}
                    size="xs"
                    color="violet"
                    loading={
                        isCreatedDashboardSummaryLoading ||
                        isPersistedDashboardSummaryLoading
                    }
                >
                    {summary
                        ? 'Dashboard Summary'
                        : 'Generate Dashboard Summary'}
                </Button>
            </Tooltip>
        </>
    );
};

export default AIDashboardSummary;

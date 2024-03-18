import { Alert, Anchor, List, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconAlertCircle } from '@tabler/icons-react';
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useDashboardsContainingChart } from '../../../hooks/dashboard/useDashboards';
import {
    useSavedQuery,
    useSavedQueryDeleteMutation,
} from '../../../hooks/useSavedQuery';
import { ModalIntents, ModalTitle } from '../../../providers/ModalsProvider';
import MantineIcon from '../MantineIcon';

export const useChartDeleteModal = (
    uuid: string | undefined,
    projectUuid: string,
) => {
    const { data: chart, isInitialLoading: isChartLoading } = useSavedQuery({
        id: uuid,
    });
    const {
        data: relatedDashboards,
        isInitialLoading: isLoadingRelatedDashboards,
    } = useDashboardsContainingChart(projectUuid, uuid);
    const { mutateAsync: deleteChart, isLoading: isDeleting } =
        useSavedQueryDeleteMutation();

    const closeModal = useCallback(() => {
        console.log({ modals });
        modals.close(ModalIntents.Delete);
    }, []);

    const openModal = useCallback(
        ({ onConfirm }: { onConfirm?: () => void }) => {
            if (
                !isChartLoading &&
                !isLoadingRelatedDashboards &&
                chart &&
                relatedDashboards &&
                uuid
            ) {
                modals.openContextModal({
                    modal: ModalIntents.Delete,
                    title: (
                        <ModalTitle intent={ModalIntents.Delete}>
                            Delete chart
                        </ModalTitle>
                    ),
                    innerProps: {
                        modalBody: (
                            <>
                                <Text>
                                    Are you sure you want to delete the chart{' '}
                                    <Text span fw={600}>
                                        "{chart.name}"
                                    </Text>
                                    ?
                                </Text>
                                {relatedDashboards.length > 0 ? (
                                    <>
                                        <Alert
                                            icon={
                                                <MantineIcon
                                                    icon={IconAlertCircle}
                                                />
                                            }
                                            title={
                                                <Text fw={600}>
                                                    This action will remove a
                                                    chart tile from{' '}
                                                    {relatedDashboards.length}{' '}
                                                    dashboard
                                                    {relatedDashboards.length >
                                                    1
                                                        ? 's'
                                                        : ''}
                                                    :
                                                </Text>
                                            }
                                        >
                                            <List fz="sm">
                                                {relatedDashboards.map(
                                                    (dashboard) => (
                                                        <List.Item
                                                            key={dashboard.uuid}
                                                        >
                                                            <Anchor
                                                                component={Link}
                                                                target="_blank"
                                                                to={`/projects/${projectUuid}/dashboards/${dashboard.uuid}`}
                                                            >
                                                                {dashboard.name}
                                                            </Anchor>
                                                        </List.Item>
                                                    ),
                                                )}
                                            </List>
                                        </Alert>
                                    </>
                                ) : null}
                            </>
                        ),

                        onConfirm: async () => {
                            // Can't use await in the onConfirm function because the modal won't close after
                            // If `onConfirm` wasn't set as async, then the modal would close
                            await deleteChart(uuid);

                            onConfirm?.();
                        },

                        onConfirmIsLoading: isDeleting,
                    },
                });
            }
        },
        [
            isChartLoading,
            isLoadingRelatedDashboards,
            chart,
            relatedDashboards,
            uuid,
            isDeleting,
            projectUuid,
            deleteChart,
        ],
    );

    return {
        openModal,
        closeModal,
    };
};

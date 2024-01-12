import {
    Alert,
    Anchor,
    Button,
    Group,
    List,
    Modal,
    ModalProps,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { FC } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDashboardsContainingChart } from '../../../hooks/dashboard/useDashboards';
import {
    useSavedQuery,
    useSavedQueryDeleteMutation,
} from '../../../hooks/useSavedQuery';
import MantineIcon from '../MantineIcon';

interface ChartDeleteModalProps extends ModalProps {
    uuid: string;
    onConfirm?: () => void;
}

const ChartDeleteModal: FC<ChartDeleteModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: chart, isInitialLoading } = useSavedQuery({ id: uuid });
    const {
        data: relatedDashboards,
        isInitialLoading: isLoadingRelatedDashboards,
    } = useDashboardsContainingChart(projectUuid, uuid);
    const { mutateAsync: deleteChart, isLoading: isDeleting } =
        useSavedQueryDeleteMutation();

    if (
        isInitialLoading ||
        isLoadingRelatedDashboards ||
        !chart ||
        !relatedDashboards
    ) {
        return null;
    }

    const handleConfirm = async () => {
        await deleteChart(uuid);
        onConfirm?.();
    };

    return (
        <Modal title={<Title order={4}>Delete Chart</Title>} {...modalProps}>
            <Stack spacing="lg" pt="sm">
                <Text>
                    Are you sure you want to delete the chart{' '}
                    <Text span fw={600}>
                        "{chart.name}"
                    </Text>
                    ?
                </Text>

                {relatedDashboards.length > 0 && (
                    <>
                        <Alert
                            icon={<MantineIcon icon={IconAlertCircle} />}
                            title={
                                <Text fw={600}>
                                    This action will remove a chart tile from{' '}
                                    {relatedDashboards.length} dashboard
                                    {relatedDashboards.length > 1 ? 's' : ''}:
                                </Text>
                            }
                        >
                            <List fz="sm">
                                {relatedDashboards.map((dashboard) => (
                                    <List.Item key={dashboard.uuid}>
                                        <Anchor
                                            component={Link}
                                            target="_blank"
                                            to={`/projects/${projectUuid}/dashboards/${dashboard.uuid}`}
                                        >
                                            {dashboard.name}
                                        </Anchor>
                                    </List.Item>
                                ))}
                            </List>
                        </Alert>
                    </>
                )}

                <Group position="right" mt="sm">
                    <Button
                        color="dark"
                        variant="outline"
                        onClick={modalProps.onClose}
                    >
                        Cancel
                    </Button>

                    <Button
                        loading={isDeleting}
                        color="red"
                        onClick={handleConfirm}
                    >
                        Delete
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

export default ChartDeleteModal;

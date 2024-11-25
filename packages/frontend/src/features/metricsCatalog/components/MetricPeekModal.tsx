import {
    Alert,
    Group,
    LoadingOverlay,
    Modal,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { Hash } from '../../../svgs/metricsCatalog';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetric } from '../hooks/useMetricsCatalog';

type Props = Pick<ModalProps, 'opened' | 'onClose'>;

export const MetricPeekModal: FC<Props> = ({ opened, onClose }) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const { tableName, metricName } = useParams<{
        tableName: string;
        metricName: string;
    }>();

    const { data, isLoading } = useMetric({
        projectUuid,
        tableName,
        metricName,
    });

    const history = useHistory();

    const handleClose = () => {
        history.push(`/projects/${projectUuid}/metrics`);
        onClose();
    };

    return (
        <Modal.Root
            opened={opened}
            onClose={handleClose}
            yOffset={200}
            scrollAreaComponent={undefined}
            size="lg"
        >
            <Modal.Overlay />
            <Modal.Content sx={{ overflow: 'hidden' }} radius="md">
                <LoadingOverlay visible={isLoading} />
                <Modal.Header
                    sx={(theme) => ({
                        borderBottom: `1px solid ${theme.colors.gray[4]}`,
                    })}
                >
                    <Group spacing="xs">
                        <Hash />
                        <Text fw={500}>Metric Details</Text>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>
                <Modal.Body p={0} h="100%">
                    <Stack spacing="xs" p="md">
                        <Text fw={500}>Name</Text>
                        <Text>{data?.label}</Text>
                        <Text fw={500}>Description</Text>
                        <Text>
                            {data?.description || 'No description provided'}
                        </Text>
                    </Stack>
                    <Alert
                        title="Visualization"
                        icon={<MantineIcon icon={IconAlertCircle} />}
                    >
                        Coming soon!
                    </Alert>
                </Modal.Body>
            </Modal.Content>
        </Modal.Root>
    );
};

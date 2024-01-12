import {
    Button,
    Group,
    Modal,
    ModalProps,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import React, { FC } from 'react';
import MantineIcon from '../MantineIcon';

interface Props extends ModalProps {
    name: string;
    onConfirm: () => void;
}

const DeleteChartTileThatBelongsToDashboardModal: FC<Props> = ({
    name,
    onConfirm,
    ...modalProps
}) => (
    <Modal
        size="md"
        title={
            <Group spacing="xs">
                <MantineIcon size="lg" icon={IconAlertCircle} color="red" />
                <Title order={4}>Delete chart</Title>
            </Group>
        }
        {...modalProps}
    >
        <Stack>
            <Text>
                Are you sure you want to delete the chart <b>{name}</b>?
            </Text>
            <Text>
                This chart was created from within the dashboard, so removing
                the tile will also result in the permanent deletion of the
                chart.
            </Text>

            <Group position="right" spacing="xs">
                <Button
                    variant="outline"
                    color="dark"
                    onClick={modalProps.onClose}
                >
                    Cancel
                </Button>

                <Button color="red" onClick={onConfirm} type="submit">
                    Delete
                </Button>
            </Group>
        </Stack>
    </Modal>
);

export default DeleteChartTileThatBelongsToDashboardModal;

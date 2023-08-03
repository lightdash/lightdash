import {
    Button,
    Group,
    Modal,
    ModalProps,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconFolders } from '@tabler/icons-react';
import React, { FC } from 'react';

interface Props extends ModalProps {
    name: string;
    spaceUuid: string;
    spaceName: string;
    onConfirm: () => void;
}

const MoveChartThatBelongsToDashboardModal: FC<Props> = ({
    name,
    spaceUuid,
    spaceName,
    onConfirm,
    ...modelProps
}) => (
    <Modal
        size="md"
        title={
            <Group spacing="xs">
                <IconFolders size={15} />
                <Title order={4}>
                    Move {name} to {spaceName}
                </Title>
            </Group>
        }
        {...modelProps}
    >
        <Stack>
            <Text>
                Are you sure you want to move the chart <b>{name}</b> to the
                space <b>{spaceName}</b>?
            </Text>
            <Text>
                This chart was created from within the dashboard, moving the
                chart to the space will make it available to other dashboards
                and show in chart lists.
            </Text>

            <Group position="right" spacing="xs">
                <Button variant="outline" onClick={modelProps.onClose}>
                    Cancel
                </Button>

                <Button color="red" onClick={onConfirm} type="submit">
                    Move
                </Button>
            </Group>
        </Stack>
    </Modal>
);

export default MoveChartThatBelongsToDashboardModal;

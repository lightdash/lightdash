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
import { FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    warehouseCredentialsToBeDeleted: string | undefined;
};

export const DeleteCredentialsModal: FC<Props> = ({
    opened,
    onClose,
    warehouseCredentialsToBeDeleted,
}) => (
    <Modal
        title={
            <Group spacing="xs">
                <MantineIcon size="lg" icon={IconAlertCircle} color="red" />
                <Title order={4}>Delete credentials</Title>
            </Group>
        }
        opened={opened}
        onClose={onClose}
    >
        <Stack>
            <Text fz="sm">
                Are you sure you want to delete credentials:{' '}
                <b>{warehouseCredentialsToBeDeleted}</b>?
            </Text>

            <Group position="right" spacing="xs">
                <Button
                    size="xs"
                    variant="outline"
                    onClick={onClose}
                    color="dark"
                >
                    Cancel
                </Button>

                <Button
                    size="xs"
                    color="red"
                    onClick={() => {}} // TODO - delete credentials from database
                    type="submit"
                >
                    Delete
                </Button>
            </Group>
        </Stack>
    </Modal>
);

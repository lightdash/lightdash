import { Button, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { Dispatch, FC, SetStateAction } from 'react';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    isDeletingWarehouseCredentials: string | undefined;
    setIsDeletingWarehouseCredentials: Dispatch<
        SetStateAction<string | undefined>
    >;
};

export const DeleteCredentialsModal: FC<Props> = ({
    isDeletingWarehouseCredentials,
    setIsDeletingWarehouseCredentials,
}) => (
    <Modal
        title={
            <Group spacing="xs">
                <MantineIcon size="lg" icon={IconAlertCircle} color="red" />
                <Title order={4}>Delete credentials</Title>
            </Group>
        }
        opened={!!isDeletingWarehouseCredentials}
        onClose={() => setIsDeletingWarehouseCredentials(undefined)}
    >
        <Stack>
            <Text>
                Are you sure you want to delete credentials:{' '}
                <b>{isDeletingWarehouseCredentials}</b>?
            </Text>

            <Group position="right" spacing="xs">
                <Button
                    variant="outline"
                    onClick={() => setIsDeletingWarehouseCredentials(undefined)}
                    color="dark"
                >
                    Cancel
                </Button>

                <Button
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

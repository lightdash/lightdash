import { Button, Flex, Group, Modal, Stack, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';

import { type ServiceAccount } from '@lightdash/common';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    isDeleting: boolean;
    isOpen: boolean;
    onClose: () => void;
    onDelete: (uuid: string) => void;
    serviceAccount: ServiceAccount;
};

export const ServiceAccountsDeleteModal: FC<Props> = ({
    isDeleting,
    isOpen,
    onClose,
    onDelete,
    serviceAccount,
}) => {
    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconAlertCircle} color="red" />
                    <span>Delete service account</span>
                </Group>
            }
            styles={(theme) => ({
                title: {
                    fontWeight: 'bold',
                    fontSize: theme.fontSizes.lg,
                },
            })}
        >
            <Stack spacing="xl">
                <Text>
                    Are you sure? This will permanently delete the{' '}
                    <Text fw={600} component="span">
                        {serviceAccount?.description}
                    </Text>{' '}
                    service account.
                </Text>

                <Flex gap="sm" justify="flex-end">
                    <Button
                        color="dark"
                        variant="outline"
                        disabled={isDeleting}
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        color="red"
                        disabled={isDeleting}
                        onClick={() => {
                            onDelete(serviceAccount?.uuid ?? '');
                        }}
                    >
                        Delete
                    </Button>
                </Flex>
            </Stack>
        </Modal>
    );
};

import {
    Button,
    Group,
    Modal,
    ModalProps,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useDeleteOrganizationMutation } from '../../../hooks/organization/useOrganizationDeleteMultation';
import MantineIcon from '../../common/MantineIcon';

export const OrganizationDeleteModal: FC<
    Pick<ModalProps, 'opened' | 'onClose'>
> = ({ opened, onClose }) => {
    const { isInitialLoading, data: organization } = useOrganization();
    const { mutateAsync, isLoading: isDeleting } =
        useDeleteOrganizationMutation();

    const [confirmOrgName, setConfirmOrgName] = useState<string>();

    if (isInitialLoading || !organization) return null;

    const handleConfirm = async () => {
        await mutateAsync(organization.organizationUuid);
        onClose();
    };

    const handleOnClose = () => {
        setConfirmOrgName(undefined);
        onClose();
    };

    return (
        <Modal
            size="md"
            opened={opened}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconAlertCircle} color="red" />
                    <Title order={4}>Delete Organization</Title>
                </Group>
            }
            onClose={handleOnClose}
        >
            <Stack>
                <Text>
                    Type the name of this organization{' '}
                    <b>{organization.name}</b> to confirm you want to delete
                    this organization and its users. This action is not
                    reversible.
                </Text>

                <TextInput
                    name="confirmOrgName"
                    placeholder={organization.name}
                    value={confirmOrgName}
                    onChange={(e) => setConfirmOrgName(e.target.value)}
                />

                <Group position="right" spacing="xs">
                    <Button
                        variant="outline"
                        onClick={handleOnClose}
                        color="dark"
                    >
                        Cancel
                    </Button>

                    <Button
                        color="red"
                        disabled={
                            confirmOrgName?.toLowerCase() !==
                            organization.name.toLowerCase()
                        }
                        loading={isDeleting}
                        onClick={() => handleConfirm()}
                        type="submit"
                    >
                        Delete
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

import { Button, Group, Stack, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconUserShield } from '@tabler/icons-react';

import { EmptyState } from '../../components/common/EmptyState';
import MantineIcon from '../../components/common/MantineIcon';
import PageSpinner from '../../components/PageSpinner';
import { CustomRolesCreateModal } from '../features/customRoles/CustomRolesCreateModal';
import { CustomRolesTable } from '../features/customRoles/CustomRolesTable';
import { useCustomRoles } from '../features/customRoles/useCustomRoles';

export const CustomRoles = () => {
    const [opened, { open, close }] = useDisclosure(false);
    const { listRoles, createRole, deleteRole, updateRole } = useCustomRoles();

    const handleSaveRole = async (values: {
        name: string;
        description?: string;
    }) => {
        await createRole.mutateAsync(values);
        close();
    };

    const handleDeleteRole = (uuid: string) => {
        deleteRole.mutate(uuid);
    };

    const handleEditRole = (
        uuid: string,
        values: { name: string; description?: string },
    ) => {
        updateRole.mutate({ roleUuid: uuid, data: values });
    };

    if (listRoles.isLoading) {
        return <PageSpinner />;
    }

    const hasRoles = (listRoles?.data?.length ?? 0) > 0;

    return (
        <Stack mb="lg">
            {hasRoles ? (
                <>
                    <Group position="apart">
                        <Title order={5}>Custom roles</Title>
                        <Button onClick={open} size="xs">
                            Create custom role
                        </Button>
                    </Group>
                    <CustomRolesTable
                        roles={listRoles?.data ?? []}
                        onDelete={handleDeleteRole}
                        onEdit={handleEditRole}
                        isDeleting={deleteRole.isLoading}
                        isEditing={updateRole.isLoading}
                    />
                </>
            ) : (
                <EmptyState
                    icon={
                        <MantineIcon
                            icon={IconUserShield}
                            color="gray.6"
                            stroke={1}
                            size="5xl"
                        />
                    }
                    title="No custom roles"
                    description="You haven't created any custom roles yet. Custom roles allow you to define specific permissions for your organization."
                >
                    <Button onClick={open}>Create custom role</Button>
                </EmptyState>
            )}

            <CustomRolesCreateModal
                isOpen={opened}
                onClose={close}
                onSave={handleSaveRole}
                isWorking={createRole.isLoading}
            />
        </Stack>
    );
};

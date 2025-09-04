import {
    Button,
    Group,
    Modal,
    Select,
    Stack,
    TextInput,
    Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC, useMemo } from 'react';

import { type Role, type RoleWithScopes } from '@lightdash/common';
import startCase from 'lodash/startCase';
import { validateRoleName } from './utils/roleValidation';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: {
        roleId: string;
        name: string;
        description: string;
    }) => Promise<void>;
    isSubmitting?: boolean;
    roles: Role[] | RoleWithScopes[];
};

type FormData = {
    roleId: string;
    name: string;
    description: string;
};

export const DuplicateRoleModal: FC<Props> = ({
    isOpen,
    onClose,
    onSubmit,
    isSubmitting = false,
    roles,
}) => {
    const form = useForm<FormData>({
        initialValues: {
            roleId: '',
            name: '',
            description: '',
        },
        validate: {
            name: validateRoleName,
            roleId: (value) => {
                if (!value) {
                    return 'Please select a role to duplicate';
                }
                return null;
            },
        },
    });

    const rolesSelectData = useMemo(() => {
        const systemRoles = roles
            .filter((role) => role.ownerType === 'system')
            .map((role) => ({
                value: role.roleUuid,
                label: startCase(role.name),
                group: 'System roles',
            }));

        const customRoles = roles
            .filter((role) => role.ownerType === 'user')
            .map((role) => ({
                value: role.roleUuid,
                label: role.name,
                group: 'Custom roles',
            }));

        return [...systemRoles, ...customRoles];
    }, [roles]);

    const handleRoleChange = (value: string) => {
        const selectedRole = roles.find((role) => role.roleUuid === value);
        if (selectedRole) {
            form.setFieldValue('name', `Copy of: ${selectedRole.name}`);
        }
        form.setFieldValue('roleId', value);
    };

    const handleSubmit = async (values: FormData) => {
        await onSubmit(values);
        form.reset();
    };

    const handleClose = () => {
        form.reset();
        onClose();
    };

    const getTitle = () => {
        if (!form.values.roleId) return 'Duplicate role';

        const roleName = rolesSelectData.find(
            (role) => role.value === form.values.roleId,
        )?.label;

        return `Duplicate ${roleName} role`;
    };

    return (
        <Modal
            opened={isOpen}
            onClose={handleClose}
            title={getTitle()}
            size="md"
        >
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack>
                    <Select
                        label="Select role to duplicate"
                        placeholder="Choose a role"
                        searchable
                        nothingFound="No roles found"
                        data={rolesSelectData}
                        required
                        disabled={isSubmitting}
                        value={form.values.roleId}
                        onChange={handleRoleChange}
                        error={form.errors.roleId}
                    />
                    <TextInput
                        label="New role name"
                        placeholder="e.g., Finance Analyst"
                        disabled={isSubmitting}
                        {...form.getInputProps('name')}
                    />
                    <Textarea
                        label="Description"
                        placeholder="Describe the purpose of this role"
                        rows={3}
                        disabled={isSubmitting}
                        {...form.getInputProps('description')}
                    />
                    <Group position="right" mt="md">
                        <Button
                            variant="outline"
                            onClick={handleClose}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={isSubmitting}>
                            Duplicate role
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

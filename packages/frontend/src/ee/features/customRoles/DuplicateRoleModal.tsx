import { type Role, type RoleWithScopes } from '@lightdash/common';
import { Button, Select, Stack, TextInput, Textarea } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconCopy } from '@tabler/icons-react';
import startCase from 'lodash/startCase';
import { type FC, useMemo } from 'react';
import MantineModal from '../../../components/common/MantineModal';
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
        if (!roles) return [];

        const systemRoles = roles
            .filter((role) => role.ownerType === 'system')
            .map((role) => ({
                value: role.roleUuid,
                label: startCase(role.name),
            }));

        const customRoles = roles
            .filter((role) => role.ownerType === 'user')
            .map((role) => ({
                value: role.roleUuid,
                label: role.name,
            }));

        return [
            {
                group: 'System roles',
                items: systemRoles,
            },
            {
                group: 'Custom roles',
                items: customRoles,
            },
        ];
    }, [roles]);

    const handleRoleChange = (value: string | null) => {
        if (!value || !roles) return;
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

        const roleName = rolesSelectData
            .find((role) =>
                role.items.some((item) => item.value === form.values.roleId),
            )
            ?.items.find((item) => item.value === form.values.roleId)?.label;

        return `Duplicate ${roleName} role`;
    };

    return (
        <MantineModal
            opened={isOpen}
            onClose={handleClose}
            title={getTitle()}
            icon={IconCopy}
            size="md"
            cancelDisabled={isSubmitting}
            actions={
                <Button
                    type="submit"
                    form="duplicate-role-form"
                    loading={isSubmitting}
                >
                    Duplicate role
                </Button>
            }
        >
            <form
                id="duplicate-role-form"
                onSubmit={form.onSubmit(handleSubmit)}
            >
                <Stack>
                    <Select
                        label="Select role to duplicate"
                        placeholder="Choose a role"
                        searchable
                        nothingFoundMessage="No roles found"
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
                </Stack>
            </form>
        </MantineModal>
    );
};

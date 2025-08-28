import { Button, Group, Stack, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';

import { isSystemRole } from '@lightdash/common';
import { Link } from 'react-router';
import { ScopeSelector } from '../ScopeSelector';
import { type RoleFormValues } from '../types';
import styles from './RoleBuilder.module.css';

type Props = {
    initialValues: {
        name: string;
        description: string;
        scopes: string[];
    };
    onSubmit: (values: {
        name: string;
        description: string;
        scopes: string[];
    }) => void;
    isWorking: boolean;
    mode: 'create' | 'edit';
};

/**
 * Allows admins to create and edit roles. Includes a selectable list of scopes to assign to the role.
 */
export const RoleBuilder: FC<Props> = ({
    initialValues,
    onSubmit,
    isWorking,
    mode,
}) => {
    // Convert array of scopes to object format
    const initialScopesObject = initialValues.scopes.reduce(
        (acc, scope) => ({ ...acc, [scope]: true }),
        {} as Record<string, boolean>,
    );

    const form = useForm<RoleFormValues>({
        initialValues: {
            name: initialValues.name,
            description: initialValues.description,
            scopes: initialScopesObject,
        },
        validate: {
            name: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Role name is required';
                }
                if (value.length < 3) {
                    return 'Role name must be at least 3 characters';
                }
                if (isSystemRole(value.toLocaleLowerCase())) {
                    return 'Role name cannot match a system role';
                }
                return null;
            },
            scopes: (value) => {
                const isScopesEmpty = !Object.values(value).some(Boolean);
                if (isScopesEmpty) {
                    return 'At least one scope is required';
                }
                return null;
            },
        },
    });

    const handleSubmit = () => {
        form.validate();

        if (form.isValid()) {
            const scopeNames = Object.entries(form.values.scopes)
                .filter(([_, isSelected]) => isSelected)
                .map(([scope]) => scope);

            onSubmit({
                name: form.values.name,
                description: form.values.description,
                scopes: scopeNames,
            });
        }
    };

    return (
        <Stack h="80vh" pt="md">
            <div className={styles.scrollableContent}>
                <Stack spacing="lg">
                    <Stack spacing="md">
                        <TextInput
                            label="Role name"
                            placeholder="e.g., Finance Analyst"
                            required
                            disabled={isWorking}
                            {...form.getInputProps('name')}
                        />
                        <Textarea
                            label="Description"
                            placeholder="Describe the purpose of this role"
                            rows={3}
                            disabled={isWorking}
                            {...form.getInputProps('description')}
                        />
                    </Stack>
                    <ScopeSelector form={form} />
                </Stack>
            </div>

            <Group pt="xl" position="right">
                <Button
                    variant="outline"
                    component={Link}
                    to="/generalSettings/customRoles"
                    disabled={isWorking}
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleSubmit}
                    loading={isWorking}
                    disabled={mode === 'edit' && !form.isDirty()}
                >
                    {mode === 'create' ? 'Create role' : 'Save changes'}
                </Button>
            </Group>
        </Stack>
    );
};

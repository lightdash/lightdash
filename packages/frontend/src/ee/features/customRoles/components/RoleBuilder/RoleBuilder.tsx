import { isScopeAssignableAtLevel, type RoleLevel } from '@lightdash/common';
import {
    Box,
    Button,
    Flex,
    Input,
    SegmentedControl,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import { Link } from 'react-router';
import { SettingsCard } from '../../../../../components/common/Settings/SettingsCard';
import { validateRoleName, validateScopes } from '../../utils/roleValidation';
import { ScopeSelector } from '../ScopeSelector';
import { type RoleFormValues } from '../types';
import styles from './RoleBuilder.module.css';

type Props = {
    initialValues: {
        name: string;
        description: string;
        level: RoleLevel;
        scopes: string[];
    };
    onSubmit: (values: {
        name: string;
        description: string;
        level: RoleLevel;
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
            level: initialValues.level,
            scopes: initialScopesObject,
        },
        validate: {
            name: validateRoleName,
            scopes: validateScopes,
        },
    });

    const handleSubmit = form.onSubmit((values) => {
        const scopeNames = Object.entries(values.scopes)
            .filter(([_, isSelected]) => isSelected)
            .map(([scope]) => scope);

        onSubmit({
            name: values.name,
            description: values.description,
            level: values.level,
            scopes: scopeNames,
        });
    });

    const handleLevelChange = (value: string) => {
        const level = value as RoleLevel;
        const scopes = Object.entries(form.values.scopes).reduce<
            Record<string, boolean>
        >(
            (acc, [scopeName, isSelected]) => ({
                ...acc,
                [scopeName]:
                    isSelected && isScopeAssignableAtLevel(scopeName, level),
            }),
            {},
        );

        form.setValues({
            ...form.values,
            level,
            scopes,
        });
    };

    return (
        <form onSubmit={handleSubmit} className={styles.container}>
            <Box className={styles.content}>
                <Stack gap="xs" className={styles.contentStack}>
                    <SettingsCard>
                        <Stack gap="md">
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
                            <Stack gap="two">
                                <Input.Label>Level</Input.Label>
                                <SegmentedControl
                                    data={[
                                        {
                                            value: 'project',
                                            label: 'Project',
                                        },
                                        {
                                            value: 'organization',
                                            label: 'Organization',
                                        },
                                    ]}
                                    disabled={isWorking || mode === 'edit'}
                                    value={form.values.level}
                                    onChange={handleLevelChange}
                                />
                                {mode === 'edit' && (
                                    <Text fz="xs" c="dimmed">
                                        Level can't be changed after creation.
                                    </Text>
                                )}
                            </Stack>
                        </Stack>
                    </SettingsCard>

                    <SettingsCard className={styles.permissionsCard}>
                        <Box className={styles.permissionsContent}>
                            <ScopeSelector
                                form={form}
                                level={form.values.level}
                            />
                        </Box>
                        <Flex
                            justify="flex-end"
                            gap="sm"
                            className={styles.footer}
                        >
                            <Button
                                variant="default"
                                component={Link}
                                to="/generalSettings/customRoles"
                                disabled={isWorking}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                loading={isWorking}
                                disabled={mode === 'edit' && !form.isDirty()}
                            >
                                {mode === 'create'
                                    ? 'Create role'
                                    : 'Save changes'}
                            </Button>
                        </Flex>
                    </SettingsCard>
                </Stack>
            </Box>
        </form>
    );
};

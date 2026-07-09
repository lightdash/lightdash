import { isScopeAssignableAtLevel, type RoleLevel } from '@lightdash/common';
import {
    Box,
    Button,
    Flex,
    Group,
    Input,
    Stack,
    Text,
    Textarea,
    TextInput,
    UnstyledButton,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import {
    IconAlertTriangleFilled,
    IconBuilding,
    IconCircleCheckFilled,
    IconCircleXFilled,
    IconFolder,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { SettingsCard } from '../../../../../components/common/Settings/SettingsCard';
import { validateRoleName, validateScopes } from '../../utils/roleValidation';
import {
    getScopeDependencyStatusCounts,
    type DependencyStatus,
} from '../../utils/scopeUtils';
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
    /**
     * Locks the level control even in create mode (e.g. when duplicating an
     * existing custom role, whose level can't be changed).
     */
    levelLocked?: boolean;
    levelLockedHint?: string;
    /**
     * When changing level, re-derive the selected scopes from `initialValues`
     * (filtered to what's assignable at the new level) instead of pruning the
     * running selection. Used when duplicating so switching level back and forth
     * restores the source role's scopes rather than progressively losing them.
     */
    rederiveScopesOnLevelChange?: boolean;
};

const dependencyStatusItems = [
    { key: 'full', icon: IconCircleCheckFilled, color: 'green' },
    { key: 'partial', icon: IconAlertTriangleFilled, color: 'yellow' },
    { key: 'empty', icon: IconCircleXFilled, color: 'red' },
] as const satisfies Array<{
    key: DependencyStatus;
    icon: typeof IconCircleCheckFilled;
    color: string;
}>;

const roleLevelOptions = [
    {
        value: 'project',
        title: 'Project role',
        description:
            'Assigned per project. A user or group can hold different project roles on different projects.',
        icon: IconFolder,
    },
    {
        value: 'organization',
        title: 'Organization role',
        description:
            'Grants access to organization-wide admin settings, applied across the whole org. Any project-scoped permissions you add here will apply to every project.',
        icon: IconBuilding,
    },
] as const satisfies Array<{
    value: RoleLevel;
    title: string;
    description: string;
    icon: typeof IconFolder;
}>;

/**
 * Allows admins to create and edit roles. Includes a selectable list of scopes to assign to the role.
 */
export const RoleBuilder: FC<Props> = ({
    initialValues,
    onSubmit,
    isWorking,
    mode,
    levelLocked = false,
    levelLockedHint,
    rederiveScopesOnLevelChange = false,
}) => {
    // Convert array of scopes to object format, keeping only scopes assignable
    // at the initial level — duplicated roles (e.g. system Admin) can carry
    // scopes from both levels, and the hidden ones must not leak into submit.
    const initialScopesObject = initialValues.scopes.reduce(
        (acc, scope) => ({
            ...acc,
            [scope]: isScopeAssignableAtLevel(scope, initialValues.level),
        }),
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
        const scopes = rederiveScopesOnLevelChange
            ? initialValues.scopes.reduce<Record<string, boolean>>(
                  (acc, scopeName) => ({
                      ...acc,
                      [scopeName]: isScopeAssignableAtLevel(scopeName, level),
                  }),
                  {},
              )
            : Object.entries(form.values.scopes).reduce<
                  Record<string, boolean>
              >(
                  (acc, [scopeName, isSelected]) => ({
                      ...acc,
                      [scopeName]:
                          isSelected &&
                          isScopeAssignableAtLevel(scopeName, level),
                  }),
                  {},
              );

        form.setValues({
            ...form.values,
            level,
            scopes,
        });
    };

    const isLevelDisabled = isWorking || mode === 'edit' || levelLocked;
    const levelHint =
        mode === 'edit'
            ? "Role scope can't be changed after creation."
            : levelLocked
              ? levelLockedHint
              : undefined;

    const dependencyStatusCounts = getScopeDependencyStatusCounts({
        level: form.values.level,
        scopes: form.values.scopes || {},
    });

    return (
        <form onSubmit={handleSubmit} className={styles.container}>
            <Box className={styles.content}>
                <Stack gap="xs" className={styles.contentStack}>
                    <SettingsCard>
                        <Stack gap="md">
                            <Stack gap="xs">
                                <Stack gap="two">
                                    <Input.Label>Role scope</Input.Label>
                                    <Text fz="sm" c="dimmed">
                                        Choose where this role can be assigned.
                                        This can't be changed after the role is
                                        created.
                                    </Text>
                                    {levelHint && (
                                        <Text fz="xs" c="dimmed">
                                            {levelHint}
                                        </Text>
                                    )}
                                </Stack>
                                <Group
                                    gap="md"
                                    align="stretch"
                                    className={styles.roleLevelOptions}
                                >
                                    {roleLevelOptions.map((option) => {
                                        const isSelected =
                                            form.values.level === option.value;

                                        return (
                                            <UnstyledButton
                                                key={option.value}
                                                className={
                                                    styles.roleLevelOption
                                                }
                                                data-selected={isSelected}
                                                aria-pressed={isSelected}
                                                disabled={isLevelDisabled}
                                                onClick={() =>
                                                    handleLevelChange(
                                                        option.value,
                                                    )
                                                }
                                            >
                                                <Group
                                                    align="flex-start"
                                                    justify="space-between"
                                                    wrap="nowrap"
                                                    gap="md"
                                                >
                                                    <Group
                                                        align="flex-start"
                                                        wrap="nowrap"
                                                        gap="md"
                                                    >
                                                        <Box
                                                            className={
                                                                styles.roleLevelIcon
                                                            }
                                                        >
                                                            <MantineIcon
                                                                icon={
                                                                    option.icon
                                                                }
                                                                size="md"
                                                            />
                                                        </Box>
                                                        <Stack gap="xs">
                                                            <Text fw={600}>
                                                                {option.title}
                                                            </Text>
                                                            <Text
                                                                fz="sm"
                                                                c="dimmed"
                                                                lh={1.45}
                                                            >
                                                                {
                                                                    option.description
                                                                }
                                                            </Text>
                                                        </Stack>
                                                    </Group>
                                                    <Box
                                                        className={
                                                            styles.roleLevelIndicator
                                                        }
                                                        data-selected={
                                                            isSelected
                                                        }
                                                    >
                                                        {isSelected ? (
                                                            <MantineIcon
                                                                icon={
                                                                    IconCircleCheckFilled
                                                                }
                                                                size="md"
                                                            />
                                                        ) : null}
                                                    </Box>
                                                </Group>
                                            </UnstyledButton>
                                        );
                                    })}
                                </Group>
                            </Stack>
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
                    </SettingsCard>

                    <SettingsCard className={styles.permissionsCard}>
                        <Box className={styles.permissionsContent}>
                            <ScopeSelector
                                form={form}
                                level={form.values.level}
                            />
                        </Box>
                        <Flex
                            justify="space-between"
                            align="center"
                            gap="sm"
                            className={styles.footer}
                        >
                            <Group gap={4}>
                                {dependencyStatusItems.map((status) => (
                                    <Group key={status.key} gap={4}>
                                        <MantineIcon
                                            icon={status.icon}
                                            size={13}
                                            color={status.color}
                                        />
                                        <Text fz="sm" c="dimmed">
                                            {dependencyStatusCounts[status.key]}
                                        </Text>
                                    </Group>
                                ))}
                                <Text fz="sm" c="dimmed">
                                    dependencies
                                </Text>
                            </Group>
                            <Group gap="sm">
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
                                    disabled={
                                        mode === 'edit' && !form.isDirty()
                                    }
                                >
                                    {mode === 'create'
                                        ? 'Create role'
                                        : 'Save changes'}
                                </Button>
                            </Group>
                        </Flex>
                    </SettingsCard>
                </Stack>
            </Box>
        </form>
    );
};

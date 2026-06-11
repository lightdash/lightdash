import {
    ActionIcon,
    Button,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { type UseFormReturnType } from '@mantine/form';
import { IconPlus, IconX } from '@tabler/icons-react';
import { useMemo } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    DEFAULT_PROJECT_ROLE_SELECTION,
    type ProjectRoleRow,
} from './projectRoleOptions';
import classes from './ServiceAccountsCreateModal.module.css';

type RoleOptionGroups = {
    group: string;
    items: { value: string; label: string }[];
}[];

// Generic over both the form's value shape and its `transformValues` signature
// so the create modal (which transforms `expiresAt`) and the edit modal (no
// transform) can both pass their form in. The component only reads list state,
// so the transform type is irrelevant to its behaviour.
type Props<
    T extends { projectRoles: ProjectRoleRow[] },
    TransformValues extends (values: T) => unknown,
> = {
    form: UseFormReturnType<T, TransformValues>;
    projects: { projectUuid: string; name: string }[];
    projectRoleOptions: RoleOptionGroups;
    rolesLoading: boolean;
    disabled: boolean;
};

// Shared editor for a service account's per-project role rows, bound to a
// Mantine form's `projectRoles` list field. Used by both the create and edit
// modals so the project-access UI stays identical across them.
export const ServiceAccountProjectRoles = <
    T extends { projectRoles: ProjectRoleRow[] },
    TransformValues extends (values: T) => unknown = (values: T) => T,
>({
    form,
    projects,
    projectRoleOptions,
    rolesLoading,
    disabled,
}: Props<T, TransformValues>) => {
    const projectOptions = useMemo(
        () =>
            projects.map((p) => ({
                value: p.projectUuid,
                label: p.name,
            })),
        [projects],
    );

    // Each row's project picker hides projects already picked in OTHER rows.
    // The current row's value stays visible so the row renders the selected
    // label, not a blank.
    const projectOptionsForRow = (rowIdx: number) => {
        const taken = new Set(
            form.values.projectRoles
                .filter((_, i) => i !== rowIdx)
                .map((r) => r.projectUuid),
        );
        return projectOptions.filter((opt) => !taken.has(opt.value));
    };

    const addProjectRow = () => {
        form.insertListItem('projectRoles', {
            projectUuid: '',
            roleSelection: DEFAULT_PROJECT_ROLE_SELECTION,
        } satisfies ProjectRoleRow);
    };

    return (
        <Stack gap="xs">
            <Text size="sm" fw={500}>
                Project access
            </Text>
            {form.values.projectRoles.length === 0 && (
                <Text size="xs" c="dimmed">
                    No projects added yet.
                </Text>
            )}
            {form.values.projectRoles.map((_, idx) => (
                <Group key={idx} gap="xs" wrap="nowrap">
                    <Select
                        flex={1}
                        placeholder="Pick a project"
                        data={projectOptionsForRow(idx)}
                        searchable
                        disabled={disabled}
                        {...form.getInputProps(
                            `projectRoles.${idx}.projectUuid`,
                        )}
                    />
                    <Select
                        w={200}
                        data={projectRoleOptions}
                        searchable
                        disabled={disabled || rolesLoading}
                        {...form.getInputProps(
                            `projectRoles.${idx}.roleSelection`,
                        )}
                    />
                    <Tooltip label="Remove">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            disabled={disabled}
                            onClick={() =>
                                form.removeListItem('projectRoles', idx)
                            }
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            ))}
            {form.errors.projectRoles && (
                <Text size="xs" c="red">
                    {form.errors.projectRoles}
                </Text>
            )}
            <Button
                leftSection={<MantineIcon icon={IconPlus} />}
                variant="subtle"
                size="xs"
                disabled={
                    disabled ||
                    form.values.projectRoles.length >= projects.length
                }
                onClick={addProjectRow}
                className={classes.addProjectButton}
            >
                Add project
            </Button>
        </Stack>
    );
};

import { ProjectMemberRole, ProjectMemberRoleLabels } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Loader,
    Popover,
    Select,
    Stack,
    Table,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useProjects } from '../../../hooks/useProjects';
import {
    useGrantServiceAccountProjectAccess,
    useRevokeServiceAccountProjectAccess,
    useServiceAccountProjectGrants,
    useUpdateServiceAccountProjectAccess,
} from './useProjectAccess';

const ROLE_OPTIONS = [
    ProjectMemberRole.VIEWER,
    ProjectMemberRole.INTERACTIVE_VIEWER,
    ProjectMemberRole.EDITOR,
    ProjectMemberRole.DEVELOPER,
    ProjectMemberRole.ADMIN,
].map((role) => ({ value: role, label: ProjectMemberRoleLabels[role] }));

type Props = {
    serviceAccountUuid: string;
};

/**
 * Inline panel rendered inside the expanded row of a project-scoped SA on
 * the org Service Accounts page. Lists the SA's project grants, lets the
 * operator change roles inline, revoke a grant, and add a new project.
 *
 * Revoke is disabled when the SA has exactly one grant — the backend
 * enforces "≥1 project for Member-scoped SAs" anyway (returns 409), but
 * disabling here gives an affordance that says why instead of letting the
 * operator click and then read a toast.
 */
export const ProjectAccessPanel: FC<Props> = ({ serviceAccountUuid }) => {
    const grantsQuery = useServiceAccountProjectGrants(serviceAccountUuid);
    const grant = useGrantServiceAccountProjectAccess();
    const updateRole = useUpdateServiceAccountProjectAccess();
    const revoke = useRevokeServiceAccountProjectAccess();
    const { data: allProjects = [] } = useProjects();

    const [addOpened, { open: openAdd, close: closeAdd }] =
        useDisclosure(false);
    const [pendingProject, setPendingProject] = useState<string | null>(null);
    const [pendingRole, setPendingRole] = useState<ProjectMemberRole>(
        ProjectMemberRole.VIEWER,
    );

    // Derive both `grants` (display) and the picker filter from the raw
    // query data inside one memo so the `grants ?? []` shape doesn't
    // trigger a re-memo on every render.
    const { grants, availableProjects } = useMemo(() => {
        const rows = grantsQuery.data ?? [];
        const taken = new Set(rows.map((g) => g.projectUuid));
        return {
            grants: rows,
            availableProjects: allProjects
                .filter((p) => !taken.has(p.projectUuid))
                .map((p) => ({ value: p.projectUuid, label: p.name })),
        };
    }, [grantsQuery.data, allProjects]);

    const handleAdd = async () => {
        if (!pendingProject) return;
        await grant.mutateAsync({
            serviceAccountUuid,
            projectUuid: pendingProject,
            role: pendingRole,
        });
        setPendingProject(null);
        setPendingRole(ProjectMemberRole.VIEWER);
        closeAdd();
    };

    return (
        <Stack gap="xs" py="xs">
            <Group justify="space-between">
                <Text size="sm" fw={500}>
                    Project access
                </Text>
                <Popover
                    opened={addOpened}
                    onClose={closeAdd}
                    position="bottom-end"
                    width={320}
                    withArrow
                    shadow="md"
                >
                    <Popover.Target>
                        <Button
                            leftSection={<MantineIcon icon={IconPlus} />}
                            size="compact-xs"
                            variant="default"
                            disabled={availableProjects.length === 0}
                            onClick={openAdd}
                        >
                            Add project
                        </Button>
                    </Popover.Target>
                    <Popover.Dropdown>
                        <Stack gap="xs">
                            <Select
                                label="Project"
                                placeholder="Pick a project"
                                data={availableProjects}
                                value={pendingProject}
                                onChange={setPendingProject}
                                searchable
                            />
                            <Select
                                label="Role"
                                data={ROLE_OPTIONS}
                                value={pendingRole}
                                onChange={(v) =>
                                    v && setPendingRole(v as ProjectMemberRole)
                                }
                            />
                            <Group justify="flex-end" gap="xs">
                                <Button
                                    variant="default"
                                    size="xs"
                                    onClick={closeAdd}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size="xs"
                                    onClick={handleAdd}
                                    disabled={!pendingProject}
                                    loading={grant.isLoading}
                                >
                                    Add
                                </Button>
                            </Group>
                        </Stack>
                    </Popover.Dropdown>
                </Popover>
            </Group>

            {grantsQuery.isLoading ? (
                <Group justify="center" py="md">
                    <Loader size="xs" />
                </Group>
            ) : grants.length === 0 ? (
                <Text size="xs" c="dimmed">
                    No projects yet.
                </Text>
            ) : (
                <Table
                    striped
                    withTableBorder
                    withColumnBorders={false}
                    verticalSpacing="xs"
                    fz="sm"
                >
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Project</Table.Th>
                            <Table.Th w={180}>Role</Table.Th>
                            <Table.Th w={56} />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {grants.map((row) => {
                            const onlyOne = grants.length === 1;
                            return (
                                <Table.Tr key={row.projectUuid}>
                                    <Table.Td>{row.projectName}</Table.Td>
                                    <Table.Td>
                                        <Select
                                            size="xs"
                                            data={ROLE_OPTIONS}
                                            value={row.role}
                                            onChange={(value) =>
                                                value &&
                                                updateRole.mutate({
                                                    serviceAccountUuid,
                                                    projectUuid:
                                                        row.projectUuid,
                                                    role: value as ProjectMemberRole,
                                                })
                                            }
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <Tooltip
                                            withinPortal
                                            disabled={!onlyOne}
                                            label="Project-scoped accounts need at least one project. Delete the account instead."
                                            multiline
                                            w={260}
                                        >
                                            <span>
                                                <ActionIcon
                                                    color="red"
                                                    variant="subtle"
                                                    disabled={onlyOne}
                                                    loading={revoke.isLoading}
                                                    onClick={() =>
                                                        revoke.mutate({
                                                            serviceAccountUuid,
                                                            projectUuid:
                                                                row.projectUuid,
                                                        })
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                    />
                                                </ActionIcon>
                                            </span>
                                        </Tooltip>
                                    </Table.Td>
                                </Table.Tr>
                            );
                        })}
                    </Table.Tbody>
                </Table>
            )}
        </Stack>
    );
};

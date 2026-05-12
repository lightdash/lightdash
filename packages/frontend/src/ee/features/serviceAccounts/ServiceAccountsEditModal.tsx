import {
    OrganizationMemberRoleLabels,
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    type ProjectMemberRole as ProjectMemberRoleType,
    type ServiceAccount,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Select,
    Stack,
    Text,
} from '@mantine-8/core';
import { IconFolder, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useProjects } from '../../../hooks/useProjects';
import { useCustomRoles } from '../customRoles/useCustomRoles';
import { useServiceAccounts } from './useServiceAccounts';

const PROJECT_SYSTEM_ROLE_VALUES: ProjectMemberRoleType[] = [
    ProjectMemberRole.VIEWER,
    ProjectMemberRole.INTERACTIVE_VIEWER,
    ProjectMemberRole.EDITOR,
    ProjectMemberRole.DEVELOPER,
    ProjectMemberRole.ADMIN,
];

type Props = {
    isOpen: boolean;
    onClose: () => void;
    serviceAccount: ServiceAccount | undefined;
};

/**
 * Edit per-project memberships on an existing service account. Each row
 * commits independently via the dedicated `PUT/DELETE /project-memberships`
 * endpoints so an operator can iterate without re-rotating the token.
 *
 * The SA's base org role is fixed at creation time in v1 — changing it
 * would require a PATCH endpoint and isn't covered by the v1 ticket.
 */
export const ServiceAccountsEditModal: FC<Props> = ({
    isOpen,
    onClose,
    serviceAccount,
}) => {
    const { setProjectMembership, removeProjectMembership } =
        useServiceAccounts();
    const { listRoles } = useCustomRoles();
    const { data: projects } = useProjects();

    const [newProjectUuid, setNewProjectUuid] = useState<string>('');
    const [newRoleSelection, setNewRoleSelection] = useState<string>('');

    const roleOptions = useMemo(() => {
        const systemItems = PROJECT_SYSTEM_ROLE_VALUES.map((r) => ({
            value: `scope:${r}`,
            label: ProjectMemberRoleLabels[r],
        }));
        const customRoleOptions = (listRoles.data ?? [])
            .map((role) => ({
                value: `role:${role.roleUuid}`,
                label: role.name,
            }))
            .sort((a, b) =>
                a.label.localeCompare(b.label, undefined, {
                    sensitivity: 'base',
                }),
            );
        const groups: {
            group: string;
            items: { value: string; label: string }[];
        }[] = [{ group: 'Project system roles', items: systemItems }];
        if (customRoleOptions.length > 0) {
            groups.push({ group: 'Custom roles', items: customRoleOptions });
        }
        return groups;
    }, [listRoles.data]);

    const usedProjectUuids = useMemo(
        () =>
            new Set(
                (serviceAccount?.projectRoles ?? []).map((p) => p.projectUuid),
            ),
        [serviceAccount],
    );

    const projectOptions = useMemo(
        () =>
            (projects ?? []).map((p) => ({
                value: p.projectUuid,
                label: p.name,
                disabled: usedProjectUuids.has(p.projectUuid),
            })),
        [projects, usedProjectUuids],
    );

    // Resolve a per-row role display label. Custom-role uuids fall back to
    // "Custom role" if the role was deleted out from under the SA, so the
    // operator can still see + remove the row.
    const projectsByUuid = useMemo(() => {
        const map = new Map<string, string>();
        (projects ?? []).forEach((p) => map.set(p.projectUuid, p.name));
        return map;
    }, [projects]);

    const rolesByUuid = useMemo(() => {
        const map = new Map<string, string>();
        (listRoles.data ?? []).forEach((r) => map.set(r.roleUuid, r.name));
        return map;
    }, [listRoles.data]);

    if (!serviceAccount) return null;

    const closeModal = () => {
        setNewProjectUuid('');
        setNewRoleSelection('');
        onClose();
    };

    const handleAdd = () => {
        if (!newProjectUuid || !newRoleSelection) return;
        const sepIdx = newRoleSelection.indexOf(':');
        const kind = newRoleSelection.slice(0, sepIdx);
        const value = newRoleSelection.slice(sepIdx + 1);
        setProjectMembership.mutate(
            {
                serviceAccountUuid: serviceAccount.uuid,
                projectUuid: newProjectUuid,
                role:
                    kind === 'scope' ? (value as ProjectMemberRoleType) : null,
                roleUuid: kind === 'role' ? value : null,
            },
            {
                onSuccess: () => {
                    setNewProjectUuid('');
                    setNewRoleSelection('');
                },
            },
        );
    };

    const handleRemove = (projectUuid: string) => {
        removeProjectMembership.mutate({
            serviceAccountUuid: serviceAccount.uuid,
            projectUuid,
        });
    };

    const isWorking =
        setProjectMembership.isLoading || removeProjectMembership.isLoading;

    return (
        <MantineModal
            opened={isOpen}
            onClose={closeModal}
            title={`Project access — ${serviceAccount.description}`}
            icon={IconFolder}
            cancelLabel="Close"
            actions={null}
        >
            <Stack gap="md">
                <Group gap="xs">
                    <Text size="sm" c="ldGray.7">
                        Org role:
                    </Text>
                    <Badge variant="light" color="gray" radius="xs" size="sm">
                        {OrganizationMemberRoleLabels[
                            serviceAccount.organizationRole
                        ] ?? serviceAccount.organizationRole}
                    </Badge>
                </Group>

                <Text size="sm" fw={500}>
                    Project memberships
                </Text>

                {(serviceAccount.projectRoles ?? []).length === 0 ? (
                    <Text size="xs" c="ldGray.6">
                        This service account has no project access. Add a
                        project below.
                    </Text>
                ) : (
                    <Stack gap="xs">
                        {serviceAccount.projectRoles.map((row) => (
                            <Group
                                key={row.projectUuid}
                                gap="xs"
                                wrap="nowrap"
                                justify="space-between"
                            >
                                <Group gap="xs" wrap="nowrap">
                                    <Text size="sm" fw={500}>
                                        {projectsByUuid.get(row.projectUuid) ??
                                            row.projectUuid}
                                    </Text>
                                    <Badge
                                        variant="light"
                                        color="indigo"
                                        radius="xs"
                                        size="sm"
                                    >
                                        {row.roleUuid
                                            ? (rolesByUuid.get(row.roleUuid) ??
                                              'Custom role')
                                            : (ProjectMemberRoleLabels[
                                                  row.role as ProjectMemberRoleType
                                              ] ?? row.role)}
                                    </Badge>
                                </Group>
                                <ActionIcon
                                    variant="subtle"
                                    color="red"
                                    onClick={() =>
                                        handleRemove(row.projectUuid)
                                    }
                                    disabled={isWorking}
                                    aria-label="Remove project access"
                                >
                                    <MantineIcon icon={IconTrash} />
                                </ActionIcon>
                            </Group>
                        ))}
                    </Stack>
                )}

                <Text size="sm" fw={500} mt="md">
                    Add project access
                </Text>
                <Group gap="xs" wrap="nowrap" align="flex-end">
                    <Select
                        label="Project"
                        placeholder="Pick a project"
                        data={projectOptions}
                        value={newProjectUuid}
                        onChange={(v) => setNewProjectUuid(v ?? '')}
                        searchable
                        w="50%"
                        disabled={isWorking}
                    />
                    <Select
                        label="Role"
                        placeholder="Pick a role"
                        data={roleOptions}
                        value={newRoleSelection}
                        onChange={(v) => setNewRoleSelection(v ?? '')}
                        searchable
                        w="50%"
                        disabled={isWorking || listRoles.isLoading}
                    />
                    <Button
                        variant="filled"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={handleAdd}
                        loading={setProjectMembership.isLoading}
                        disabled={!newProjectUuid || !newRoleSelection}
                    >
                        Add
                    </Button>
                </Group>
            </Stack>
        </MantineModal>
    );
};

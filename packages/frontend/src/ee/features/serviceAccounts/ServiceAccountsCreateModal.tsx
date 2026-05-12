import {
    CommercialFeatureFlags,
    OrganizationMemberRole,
    OrganizationMemberRoleLabels,
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    ServiceAccountScope,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    CopyButton,
    Group,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import {
    IconCheck,
    IconCopy,
    IconKey,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { addDays } from 'date-fns';
import { useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useProjects } from '../../../hooks/useProjects';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useCustomRoles } from '../customRoles/useCustomRoles';

// Organization system roles surfaced as SA permission shapes. The SA inherits
// the exact same CASL grants as a user assigned this org role at the
// `applyOrganizationMemberStaticAbilities` level. `member` is intentionally
// omitted — it grants near-zero abilities and isn't a useful SA shape. SCIM
// tokens are minted via the dedicated SCIM token UI in org settings.
//
// The `scope:` prefix is just an internal tag for the dropdown's value
// space — it tells `handleOnSubmit` to translate to a `scopes: [...]`
// payload (vs `role:<uuid>` → `roleUuid` payload). It is NOT the literal
// "legacy" `org:*` scopes — those are kept accepted on the wire for
// back-compat but aren't surfaced in this dropdown.
const SYSTEM_ROLE_OPTIONS: { value: string; label: string }[] = [
    { value: `scope:${ServiceAccountScope.SYSTEM_VIEWER}`, label: 'Viewer' },
    {
        value: `scope:${ServiceAccountScope.SYSTEM_INTERACTIVE_VIEWER}`,
        label: 'Interactive viewer',
    },
    { value: `scope:${ServiceAccountScope.SYSTEM_EDITOR}`, label: 'Editor' },
    {
        value: `scope:${ServiceAccountScope.SYSTEM_DEVELOPER}`,
        label: 'Developer',
    },
    { value: `scope:${ServiceAccountScope.SYSTEM_ADMIN}`, label: 'Admin' },
];

const expireOptions = [
    { label: 'No expiration', value: '' },
    { label: '7 days', value: '7' },
    { label: '30 days', value: '30' },
    { label: '60 days', value: '60' },
    { label: '90 days', value: '90' },
    { label: '6 months', value: '180' },
    { label: '1 year', value: '365' },
];

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSave: (values: any) => void;
    isWorking: boolean;
    token?: string;
};

// Org roles offered in the "Per-project access" mode. NONE is the
// recommended default (project memberships drive everything). MEMBER is
// supported for parity with the existing user model. The high-privilege
// system roles (ADMIN/DEVELOPER/EDITOR/...) are intentionally omitted —
// they'd grant org-wide access that the per-project membership list
// can't restrict, defeating the purpose of this mode.
const PER_PROJECT_ORG_ROLE_OPTIONS = [
    OrganizationMemberRole.NONE,
    OrganizationMemberRole.MEMBER,
];

// Project-level system roles surfaced in the per-project picker.
const PROJECT_SYSTEM_ROLE_VALUES = [
    ProjectMemberRole.VIEWER,
    ProjectMemberRole.INTERACTIVE_VIEWER,
    ProjectMemberRole.EDITOR,
    ProjectMemberRole.DEVELOPER,
    ProjectMemberRole.ADMIN,
];

type AccessMode = 'org-wide' | 'per-project';

type ProjectRoleRow = {
    projectUuid: string;
    // Same prefix convention as the org-wide dropdown: `scope:<role>` for a
    // system role, `role:<uuid>` for a custom role.
    roleSelection: string;
};

export const ServiceAccountsCreateModal: FC<Props> = ({
    isOpen,
    onClose,
    onSave,
    isWorking,
    token,
}) => {
    const { listRoles } = useCustomRoles();
    const { data: projects } = useProjects();
    const perProjectFlag = useServerFeatureFlag(
        CommercialFeatureFlags.ServiceAccountProjectMemberships,
    );
    const perProjectEnabled = !!perProjectFlag.data?.enabled;

    const [accessMode, setAccessMode] = useState<AccessMode>('org-wide');
    const [organizationRole, setOrganizationRole] =
        useState<OrganizationMemberRole>(OrganizationMemberRole.NONE);
    const [projectRoleRows, setProjectRoleRows] = useState<ProjectRoleRow[]>(
        [],
    );

    // Each option's `value` is either `scope:<service-account-scope>` (e.g.
    // `scope:system:admin`) or `role:<roleUuid>`. The handleOnSubmit
    // translator splits the prefix off on the first `:` and routes to
    // either `scopes` or `roleUuid` on the create payload. Mantine v8
    // grouped data expects `{ group, items: [...] }`, not a flat
    // `group:` per item.
    //
    // Custom roles are sorted alphabetically (case-insensitive) so the
    // dropdown order is stable as the operator adds/edits roles. The
    // system-role group keeps its hand-curated order (Viewer → Admin) so
    // permission tiers read top-to-bottom.
    const roleOptions = useMemo(() => {
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
        }[] = [
            { group: 'Organization system roles', items: SYSTEM_ROLE_OPTIONS },
        ];
        if (customRoleOptions.length > 0) {
            groups.push({ group: 'Custom roles', items: customRoleOptions });
        }
        return groups;
    }, [listRoles.data]);

    // Per-project role picker data — mirrors `roleOptions` shape but the
    // system-role group lists project-level roles (no `interactive_viewer`
    // tier-mismatch tricks; these map straight to ProjectMemberRole).
    const projectRoleOptions = useMemo(() => {
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

    // Projects already used by other rows — excluded from each row's
    // picker so the operator can't double-assign access on the same
    // project (the backend would reject the conflict, but pre-filtering
    // is a better UX).
    const projectsOptions = useMemo(() => {
        const used = new Set(
            projectRoleRows.map((r) => r.projectUuid).filter(Boolean),
        );
        return (projects ?? []).map((p) => ({
            value: p.projectUuid,
            label: p.name,
            disabled: used.has(p.projectUuid),
        }));
    }, [projects, projectRoleRows]);

    const form = useForm({
        initialValues: {
            description: '',
            expiresAt: '',
            roleSelection: '',
        },
        transformValues: (values) => {
            return {
                ...values,
                expiresAt:
                    values.expiresAt === '' ? null : Number(values.expiresAt),
            };
        },
        validate: {
            roleSelection: (value) =>
                accessMode === 'org-wide' && value === ''
                    ? 'Please select a permission set'
                    : null,
        },
    });

    const closeModal = () => {
        form.reset();
        setAccessMode('org-wide');
        setOrganizationRole(OrganizationMemberRole.NONE);
        setProjectRoleRows([]);
        onClose();
    };

    const handleOnSubmit = form.onSubmit(
        ({ expiresAt, roleSelection, description }) => {
            const baseExpires = expiresAt
                ? addDays(new Date(), expiresAt)
                : expiresAt;

            if (accessMode === 'per-project') {
                // Translate each row's roleSelection (scope:<role> or
                // role:<uuid>) into the API shape. Rows with no project
                // or no role are dropped — the form validator below
                // prevents this in the happy path.
                const projectRoles = projectRoleRows
                    .filter((r) => r.projectUuid && r.roleSelection)
                    .map((r) => {
                        const sepIdx = r.roleSelection.indexOf(':');
                        const kind = r.roleSelection.slice(0, sepIdx);
                        const value = r.roleSelection.slice(sepIdx + 1);
                        return {
                            projectUuid: r.projectUuid,
                            role:
                                kind === 'scope'
                                    ? (value as ProjectMemberRole)
                                    : null,
                            roleUuid: kind === 'role' ? value : null,
                        };
                    });
                onSave({
                    description,
                    expiresAt: baseExpires,
                    organizationRole,
                    projectRoles,
                });
                return;
            }

            // Org-wide mode (existing behaviour) — translate the unified
            // role selection into the API shape:
            //   scope:<service-account-scope> → { scopes: [<scope>] }
            //   role:<uuid>                   → { roleUuid: <uuid> }
            // We split on the FIRST `:` only — service-account scope names
            // themselves contain a `:` (e.g. `system:admin`) so a naive
            // `split(':')` would drop the suffix and ship `scopes: ['system']`.
            const sepIdx = roleSelection.indexOf(':');
            const kind = roleSelection.slice(0, sepIdx) as 'scope' | 'role';
            const value = roleSelection.slice(sepIdx + 1);
            const payload =
                kind === 'scope'
                    ? { scopes: [value as ServiceAccountScope] }
                    : { roleUuid: value };

            onSave({
                description,
                expiresAt: baseExpires,
                ...payload,
            });
        },
    );

    const addProjectRow = () =>
        setProjectRoleRows((rows) => [
            ...rows,
            { projectUuid: '', roleSelection: '' },
        ]);

    const updateProjectRow = (idx: number, patch: Partial<ProjectRoleRow>) =>
        setProjectRoleRows((rows) =>
            rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
        );

    const removeProjectRow = (idx: number) =>
        setProjectRoleRows((rows) => rows.filter((_, i) => i !== idx));

    const perProjectInvalid =
        accessMode === 'per-project' &&
        projectRoleRows.some((r) => !r.projectUuid || !r.roleSelection);

    return (
        <MantineModal
            opened={isOpen}
            onClose={closeModal}
            title="New Service Account"
            icon={IconKey}
            cancelLabel={token ? false : 'Cancel'}
            cancelDisabled={isWorking}
            actions={
                !token ? (
                    <Button
                        type="submit"
                        form="create-service-account-form"
                        loading={isWorking}
                        disabled={
                            perProjectInvalid ||
                            (accessMode === 'per-project' &&
                                projectRoleRows.length === 0)
                        }
                    >
                        Create service account
                    </Button>
                ) : (
                    <Button onClick={closeModal}>Done</Button>
                )
            }
        >
            {!token ? (
                <form
                    id="create-service-account-form"
                    onSubmit={handleOnSubmit}
                >
                    <Stack gap="md">
                        <TextInput
                            label="Description"
                            placeholder="What's this service account for?"
                            required
                            disabled={isWorking}
                            {...form.getInputProps('description')}
                        />
                        <Select
                            defaultValue={expireOptions[0].value}
                            label="Expiration"
                            data={expireOptions}
                            disabled={isWorking}
                            {...form.getInputProps('expiresAt')}
                        />

                        {perProjectEnabled && (
                            <SegmentedControl
                                value={accessMode}
                                onChange={(v) => setAccessMode(v as AccessMode)}
                                data={[
                                    {
                                        value: 'org-wide',
                                        label: 'Org-wide access',
                                    },
                                    {
                                        value: 'per-project',
                                        label: 'Per-project access',
                                    },
                                ]}
                                disabled={isWorking}
                            />
                        )}

                        {accessMode === 'org-wide' ? (
                            <Select
                                label="Role"
                                description={
                                    <>
                                        Pick a system role or a custom role
                                        you've created in{' '}
                                        <Anchor
                                            component={Link}
                                            to="/generalSettings/customRoles"
                                            size="xs"
                                        >
                                            custom roles
                                        </Anchor>
                                        .
                                    </>
                                }
                                placeholder="Select a permission set"
                                data={roleOptions}
                                required
                                searchable
                                maxDropdownHeight={220}
                                disabled={isWorking || listRoles.isLoading}
                                {...form.getInputProps('roleSelection')}
                            />
                        ) : (
                            <Stack gap="sm">
                                <Select
                                    label="Organization role"
                                    description="The baseline org-wide role for this service account. 'None' is recommended — access is granted only via the per-project assignments below."
                                    data={PER_PROJECT_ORG_ROLE_OPTIONS.map(
                                        (r) => ({
                                            value: r,
                                            label: OrganizationMemberRoleLabels[
                                                r
                                            ],
                                        }),
                                    )}
                                    value={organizationRole}
                                    onChange={(v) =>
                                        v &&
                                        setOrganizationRole(
                                            v as OrganizationMemberRole,
                                        )
                                    }
                                    disabled={isWorking}
                                />

                                <Text size="sm" fw={500} mt="xs">
                                    Project access
                                </Text>
                                {projectRoleRows.length === 0 ? (
                                    <Text size="xs" c="ldGray.6">
                                        No projects selected. Add one below to
                                        grant access.
                                    </Text>
                                ) : (
                                    projectRoleRows.map((row, idx) => (
                                        <Group
                                            // eslint-disable-next-line react/no-array-index-key
                                            key={idx}
                                            gap="xs"
                                            wrap="nowrap"
                                            align="flex-end"
                                        >
                                            <Select
                                                label={
                                                    idx === 0
                                                        ? 'Project'
                                                        : undefined
                                                }
                                                placeholder="Pick a project"
                                                data={projectsOptions}
                                                value={row.projectUuid}
                                                onChange={(v) =>
                                                    updateProjectRow(idx, {
                                                        projectUuid: v ?? '',
                                                    })
                                                }
                                                searchable
                                                w="50%"
                                                disabled={isWorking}
                                            />
                                            <Select
                                                label={
                                                    idx === 0
                                                        ? 'Role'
                                                        : undefined
                                                }
                                                placeholder="Pick a role"
                                                data={projectRoleOptions}
                                                value={row.roleSelection}
                                                onChange={(v) =>
                                                    updateProjectRow(idx, {
                                                        roleSelection: v ?? '',
                                                    })
                                                }
                                                searchable
                                                w="50%"
                                                disabled={
                                                    isWorking ||
                                                    listRoles.isLoading
                                                }
                                            />
                                            <ActionIcon
                                                variant="subtle"
                                                color="red"
                                                onClick={() =>
                                                    removeProjectRow(idx)
                                                }
                                                disabled={isWorking}
                                                aria-label="Remove project access"
                                            >
                                                <MantineIcon icon={IconTrash} />
                                            </ActionIcon>
                                        </Group>
                                    ))
                                )}
                                <Button
                                    variant="subtle"
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                    onClick={addProjectRow}
                                    disabled={isWorking}
                                    w="fit-content"
                                >
                                    Add project
                                </Button>
                            </Stack>
                        )}
                    </Stack>
                </form>
            ) : (
                <Stack>
                    <TextInput
                        label="Token"
                        readOnly
                        className="sentry-block ph-no-capture"
                        value={token}
                        rightSection={
                            <CopyButton value={token}>
                                {({ copied, copy }) => (
                                    <Tooltip
                                        label={copied ? 'Copied' : 'Copy'}
                                        withArrow
                                        position="right"
                                    >
                                        <ActionIcon
                                            color={copied ? 'teal' : 'gray'}
                                            onClick={copy}
                                        >
                                            <MantineIcon
                                                icon={
                                                    copied
                                                        ? IconCheck
                                                        : IconCopy
                                                }
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                            </CopyButton>
                        }
                    />
                    <Callout
                        variant="info"
                        title="Make sure to copy your access token now. You won't be able to see it again!"
                    />
                </Stack>
            )}
        </MantineModal>
    );
};

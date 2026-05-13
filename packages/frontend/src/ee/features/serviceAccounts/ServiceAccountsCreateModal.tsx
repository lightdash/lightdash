import {
    CommercialFeatureFlags,
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
    IconX,
} from '@tabler/icons-react';
import { addDays } from 'date-fns';
import { useMemo, type FC } from 'react';
import { Link } from 'react-router';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useProjects } from '../../../hooks/useProjects';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import { useCustomRoles } from '../customRoles/useCustomRoles';

// Organization-mode role options. `Member` is intentionally hidden — it's
// the backend marker for "Project-scope SA" (see the SegmentedControl
// below) and is never a user-selectable Organization role.
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

// Project-mode role options. Each row's role select offers stock
// `ProjectMemberRole`s OR any of the org's custom roles (loaded at runtime).
// Values are tagged so the submit handler can route them into the backend
// contract: `system:<role>` → `{ projectUuid, role }`, `role:<uuid>` →
// `{ projectUuid, roleUuid }`. Mirrors the org-mode `scope:` / `role:`
// convention so the two pickers feel symmetric.
const SYSTEM_PROJECT_ROLE_OPTIONS = [
    ProjectMemberRole.VIEWER,
    ProjectMemberRole.INTERACTIVE_VIEWER,
    ProjectMemberRole.EDITOR,
    ProjectMemberRole.DEVELOPER,
    ProjectMemberRole.ADMIN,
].map((role) => ({
    value: `system:${role}`,
    label: ProjectMemberRoleLabels[role],
}));
const DEFAULT_PROJECT_ROLE_SELECTION = `system:${ProjectMemberRole.VIEWER}`;

const expireOptions = [
    { label: 'No expiration', value: '' },
    { label: '7 days', value: '7' },
    { label: '30 days', value: '30' },
    { label: '60 days', value: '60' },
    { label: '90 days', value: '90' },
    { label: '6 months', value: '180' },
    { label: '1 year', value: '365' },
];

type Scope = 'organization' | 'project';

type ProjectRoleRow = {
    projectUuid: string;
    // Tagged selection: `system:<ProjectMemberRole>` or `role:<roleUuid>`.
    // Parsed at submit time into either { role } or { roleUuid }.
    roleSelection: string;
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSave: (values: any) => void;
    isWorking: boolean;
    token?: string;
};

export const ServiceAccountsCreateModal: FC<Props> = ({
    isOpen,
    onClose,
    onSave,
    isWorking,
    token,
}) => {
    const { listRoles } = useCustomRoles();
    const { data: projects = [] } = useProjects();

    // Custom roles are a feature-flagged UI surface. Mirror the gate used in
    // `Settings.tsx` so the picker hides them entirely when the org has the
    // feature off — preventing assignment of a role the admin hasn't opted
    // into. The backend keeps existing custom-role bindings live at runtime
    // regardless of the flag (see UserModel comment), so this is strictly a
    // UI gate, not a security boundary.
    const {
        health: { data: health },
    } = useApp();
    const { data: customRolesFlag } = useServerFeatureFlag(
        CommercialFeatureFlags.CustomRoles,
    );
    const isCustomRolesEnabled =
        health?.isCustomRolesEnabled || customRolesFlag?.enabled;

    const customRoleOptions = useMemo(
        () =>
            isCustomRolesEnabled
                ? (listRoles.data ?? [])
                      .map((role) => ({
                          value: `role:${role.roleUuid}`,
                          label: role.name,
                      }))
                      .sort((a, b) =>
                          a.label.localeCompare(b.label, undefined, {
                              sensitivity: 'base',
                          }),
                      )
                : [],
        [listRoles.data, isCustomRolesEnabled],
    );

    const roleOptions = useMemo(() => {
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
    }, [customRoleOptions]);

    // Per-row role picker for project mode. Same grouped shape as the
    // org-mode role select so the dropdown visually matches and custom
    // roles bubble up below the system list.
    const projectRoleOptions = useMemo(() => {
        const groups: {
            group: string;
            items: { value: string; label: string }[];
        }[] = [{ group: 'System roles', items: SYSTEM_PROJECT_ROLE_OPTIONS }];
        if (customRoleOptions.length > 0) {
            groups.push({ group: 'Custom roles', items: customRoleOptions });
        }
        return groups;
    }, [customRoleOptions]);

    const form = useForm({
        initialValues: {
            description: '',
            expiresAt: '',
            scope: 'organization' as Scope,
            roleSelection: '',
            projectRoles: [] as ProjectRoleRow[],
        },
        transformValues: (values) => ({
            ...values,
            expiresAt:
                values.expiresAt === '' ? null : Number(values.expiresAt),
        }),
        validate: {
            // Only validate the Organization-mode role select when the user
            // is actually in Organization scope; Project mode uses
            // `projectRoles` instead.
            roleSelection: (value, values) =>
                values.scope === 'organization' && value === ''
                    ? 'Please select a permission set'
                    : null,
            projectRoles: (rows, values) => {
                if (values.scope !== 'project') return null;
                if (rows.length === 0) return 'Add at least one project';
                if (rows.some((r) => !r.projectUuid))
                    return 'Pick a project for each row';
                const uniques = new Set(rows.map((r) => r.projectUuid));
                if (uniques.size !== rows.length)
                    return 'Each project can only be added once';
                return null;
            },
        },
    });

    const closeModal = () => {
        form.reset();
        onClose();
    };

    const projectOptions = useMemo(
        () =>
            projects.map((p) => ({
                value: p.projectUuid,
                label: p.name,
            })),
        [projects],
    );

    // Each row's project picker hides projects already picked in OTHER
    // rows. The current row's value stays visible so the row renders the
    // selected label, not a blank.
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

    const handleOnSubmit = form.onSubmit(
        ({ expiresAt, scope, roleSelection, description, projectRoles }) => {
            const expiresAtValue = expiresAt
                ? addDays(new Date(), expiresAt)
                : expiresAt;

            if (scope === 'project') {
                onSave({
                    description,
                    expiresAt: expiresAtValue,
                    scopes: [ServiceAccountScope.SYSTEM_MEMBER],
                    projectAccess: projectRoles.map((r) => {
                        // Tagged selection: `system:<role>` → system grant,
                        // `role:<uuid>` → custom-role grant. Mirrors the
                        // org-mode translator above.
                        const sepIdx = r.roleSelection.indexOf(':');
                        const kind = r.roleSelection.slice(0, sepIdx);
                        const value = r.roleSelection.slice(sepIdx + 1);
                        return kind === 'role'
                            ? { projectUuid: r.projectUuid, roleUuid: value }
                            : {
                                  projectUuid: r.projectUuid,
                                  role: value as ProjectMemberRole,
                              };
                    }),
                });
                return;
            }

            // Organization scope: existing translator —
            //   scope:<service-account-scope> → { scopes: [<scope>] }
            //   role:<uuid>                   → { roleUuid: <uuid> }
            const sepIdx = roleSelection.indexOf(':');
            const kind = roleSelection.slice(0, sepIdx) as 'scope' | 'role';
            const value = roleSelection.slice(sepIdx + 1);
            const payload =
                kind === 'scope'
                    ? { scopes: [value as ServiceAccountScope] }
                    : { roleUuid: value };

            onSave({
                description,
                expiresAt: expiresAtValue,
                ...payload,
            });
        },
    );

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
                        <Stack gap="xs">
                            <Text size="sm" fw={500}>
                                Scope
                            </Text>
                            <SegmentedControl
                                fullWidth
                                disabled={isWorking}
                                data={[
                                    {
                                        label: 'Organization',
                                        value: 'organization',
                                    },
                                    { label: 'Project', value: 'project' },
                                ]}
                                {...form.getInputProps('scope')}
                            />
                            <Text size="xs" c="dimmed">
                                {form.values.scope === 'organization'
                                    ? 'Grants org-wide abilities matching a system or custom role.'
                                    : 'No org-wide abilities. Pick one or more projects below; each gets its own role.'}
                            </Text>
                        </Stack>

                        {form.values.scope === 'organization' ? (
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
                                            disabled={isWorking}
                                            {...form.getInputProps(
                                                `projectRoles.${idx}.projectUuid`,
                                            )}
                                        />
                                        <Select
                                            w={200}
                                            data={projectRoleOptions}
                                            searchable
                                            disabled={
                                                isWorking || listRoles.isLoading
                                            }
                                            {...form.getInputProps(
                                                `projectRoles.${idx}.roleSelection`,
                                            )}
                                        />
                                        <Tooltip label="Remove">
                                            <ActionIcon
                                                variant="subtle"
                                                color="gray"
                                                disabled={isWorking}
                                                onClick={() =>
                                                    form.removeListItem(
                                                        'projectRoles',
                                                        idx,
                                                    )
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
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                    variant="subtle"
                                    size="xs"
                                    disabled={
                                        isWorking ||
                                        form.values.projectRoles.length >=
                                            projects.length
                                    }
                                    onClick={addProjectRow}
                                    style={{ alignSelf: 'flex-start' }}
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

import {
    CommercialFeatureFlags,
    ServiceAccountScope,
    type ProjectMemberRole,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    CopyButton,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconCheck, IconCopy, IconKey } from '@tabler/icons-react';
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
import {
    SYSTEM_PROJECT_ROLE_OPTIONS,
    type ProjectRoleRow,
} from './projectRoleOptions';
import { ServiceAccountProjectRoles } from './ServiceAccountProjectRoles';

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
                            <ServiceAccountProjectRoles
                                form={form}
                                projects={projects}
                                projectRoleOptions={projectRoleOptions}
                                rolesLoading={listRoles.isLoading}
                                disabled={isWorking}
                            />
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

import {
    ServiceAccountScope,
    type ProjectMemberRole,
    type RoleLevel,
    type ServiceAccountProjectGrant,
    type ServiceAccountScope as ServiceAccountScopeType,
    type ServiceAccountWithProjectAccessCount,
    type UpdateServiceAccount,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Center,
    Loader,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { Link } from 'react-router';
import MantineModal from '../../../components/common/MantineModal';
import { useProjects } from '../../../hooks/useProjects';
import { useCustomRoles } from '../customRoles/useCustomRoles';
import {
    SYSTEM_PROJECT_ROLE_OPTIONS,
    type ProjectRoleRow,
} from './projectRoleOptions';
import { ServiceAccountProjectRoles } from './ServiceAccountProjectRoles';
import { useServiceAccountProjectGrants } from './useProjectAccess';
import { useServiceAccounts } from './useServiceAccounts';

const EDIT_FORM_ID = 'edit-service-account-form';

type ScopeMode = 'organization' | 'project';

// Organization-mode role options. Mirrors `ServiceAccountsCreateModal` —
// `Member` is intentionally absent (it's the Project-scope marker, not a
// user-selectable Organization role).
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

// Legacy `org:*` scopes predate the `system:*` aliases shown in the picker.
// Map them so an SA minted on a legacy scope resolves to the matching option
// instead of rendering a blank Select. Mirrors `getRoleForScopes` on the
// backend.
const LEGACY_SCOPE_TO_SYSTEM: Partial<
    Record<ServiceAccountScopeType, ServiceAccountScopeType>
> = {
    [ServiceAccountScope.ORG_ADMIN]: ServiceAccountScope.SYSTEM_ADMIN,
    [ServiceAccountScope.ORG_EDIT]: ServiceAccountScope.SYSTEM_EDITOR,
    [ServiceAccountScope.ORG_READ]: ServiceAccountScope.SYSTEM_VIEWER,
};

// A project-scoped SA carries `system:member` + per-project grants.
const isProjectScoped = (sa: ServiceAccountWithProjectAccessCount) =>
    sa.scopes.includes(ServiceAccountScope.SYSTEM_MEMBER);

// Resolve the org role Select's initial value: a custom role wins; otherwise a
// single org scope (legacy scopes mapped to their system alias). Multi-scope /
// member / unmappable SAs start blank, forcing a pick.
const getInitialRoleSelection = (
    sa: ServiceAccountWithProjectAccessCount,
): string => {
    if (sa.roleUuid) {
        return `role:${sa.roleUuid}`;
    }
    if (sa.scopes.length !== 1) {
        return '';
    }
    const scope = LEGACY_SCOPE_TO_SYSTEM[sa.scopes[0]] ?? sa.scopes[0];
    return scope === ServiceAccountScope.SYSTEM_MEMBER ? '' : `scope:${scope}`;
};

// Parse a tagged role selection (`scope:x` / `role:uuid` / `system:role`) into
// its kind + value. Mirrors the create modal's submit-time translator.
const parseTaggedRole = (
    selection: string,
): { kind: string; value: string } => {
    const sepIdx = selection.indexOf(':');
    return {
        kind: selection.slice(0, sepIdx),
        value: selection.slice(sepIdx + 1),
    };
};

// Convert the SA's current grants into the form's tagged project rows.
const grantsToRows = (grants: ServiceAccountProjectGrant[]): ProjectRoleRow[] =>
    grants.map((g) =>
        g.roleUuid
            ? {
                  projectUuid: g.projectUuid,
                  roleSelection: `role:${g.roleUuid}`,
              }
            : {
                  projectUuid: g.projectUuid,
                  roleSelection: `system:${g.role}`,
              },
    );

// Edit always surfaces the org's custom roles (unlike create, which gates them
// behind the feature flag) so an SA already bound to a custom role keeps
// showing that role even if the flag is off.
const useCustomRoleOptions = () => {
    const { listRoles } = useCustomRoles();
    const options = useMemo(() => {
        const buildOptions = (level: RoleLevel) =>
            (listRoles.data ?? [])
                .filter((role) => role.level === level)
                .map((role) => ({
                    value: `role:${role.roleUuid}`,
                    label: role.name,
                }))
                .sort((a, b) =>
                    a.label.localeCompare(b.label, undefined, {
                        sensitivity: 'base',
                    }),
                );

        return {
            organization: buildOptions('organization'),
            project: buildOptions('project'),
        };
    }, [listRoles.data]);
    return { options, isLoading: listRoles.isLoading };
};

// Unified edit form — mounts only once grants are loaded so `useForm` captures
// them as initial values (per the no-effect-sync state pattern). The mutation
// and its loading state live in the parent, which derives them at render time
// (no effects); this form just builds the payload and calls `onSubmit`.
const EditForm: FC<{
    serviceAccount: ServiceAccountWithProjectAccessCount;
    grants: ServiceAccountProjectGrant[];
    isSubmitting: boolean;
    onSubmit: (payload: UpdateServiceAccount) => void;
}> = ({ serviceAccount, grants, isSubmitting, onSubmit }) => {
    const { data: projects = [] } = useProjects();
    const { options: customRoleOptions, isLoading: rolesLoading } =
        useCustomRoleOptions();
    const organizationCustomRoleOptions = customRoleOptions.organization;
    const projectCustomRoleOptions = customRoleOptions.project;

    const initialScope: ScopeMode = isProjectScoped(serviceAccount)
        ? 'project'
        : 'organization';

    const roleOptions = useMemo(() => {
        const groups: {
            group: string;
            items: { value: string; label: string }[];
        }[] = [
            { group: 'Organization system roles', items: SYSTEM_ROLE_OPTIONS },
        ];
        if (organizationCustomRoleOptions.length > 0) {
            groups.push({
                group: 'Custom roles',
                items: organizationCustomRoleOptions,
            });
        }
        return groups;
    }, [organizationCustomRoleOptions]);

    const projectRoleOptions = useMemo(() => {
        const groups: {
            group: string;
            items: { value: string; label: string }[];
        }[] = [{ group: 'System roles', items: SYSTEM_PROJECT_ROLE_OPTIONS }];
        if (projectCustomRoleOptions.length > 0) {
            groups.push({
                group: 'Custom roles',
                items: projectCustomRoleOptions,
            });
        }
        return groups;
    }, [projectCustomRoleOptions]);

    const form = useForm({
        initialValues: {
            description: serviceAccount.description,
            scope: initialScope,
            roleSelection: getInitialRoleSelection(serviceAccount),
            projectRoles: grantsToRows(grants),
        },
        validate: {
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

    const handleOnSubmit = form.onSubmit(
        ({ description, scope, roleSelection, projectRoles }) => {
            if (scope === 'project') {
                onSubmit({
                    description,
                    scopes: [ServiceAccountScope.SYSTEM_MEMBER],
                    projectAccess: projectRoles.map((r) => {
                        const { kind, value } = parseTaggedRole(
                            r.roleSelection,
                        );
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
            // Organization scope:
            //   scope:<service-account-scope> → { scopes: [<scope>] }
            //   role:<uuid>                   → { roleUuid: <uuid> }
            const { kind, value } = parseTaggedRole(roleSelection);
            onSubmit({
                description,
                ...(kind === 'scope'
                    ? { scopes: [value as ServiceAccountScopeType] }
                    : { roleUuid: value }),
            });
        },
    );

    // Switching scope mode is destructive — warn before save.
    const switchWarning =
        form.values.scope === initialScope
            ? null
            : form.values.scope === 'organization'
              ? 'Switching to Organization removes all project access from this service account.'
              : 'Switching to Project replaces the organization role with per-project access.';

    return (
        <form id={EDIT_FORM_ID} onSubmit={handleOnSubmit}>
            <Stack gap="md">
                <TextInput
                    label="Description"
                    placeholder="What's this service account for?"
                    required
                    disabled={isSubmitting}
                    {...form.getInputProps('description')}
                />

                <Stack gap="xs">
                    <Text size="sm" fw={500}>
                        Scope
                    </Text>
                    <SegmentedControl
                        fullWidth
                        disabled={isSubmitting}
                        data={[
                            { label: 'Organization', value: 'organization' },
                            { label: 'Project', value: 'project' },
                        ]}
                        {...form.getInputProps('scope')}
                    />
                    {switchWarning && (
                        <Text size="xs" c="orange">
                            {switchWarning}
                        </Text>
                    )}
                </Stack>

                {form.values.scope === 'organization' ? (
                    <Select
                        label="Role"
                        description={
                            <>
                                Pick a system role or a custom role you've
                                created in{' '}
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
                        disabled={isSubmitting || rolesLoading}
                        {...form.getInputProps('roleSelection')}
                    />
                ) : (
                    <ServiceAccountProjectRoles
                        form={form}
                        projects={projects}
                        projectRoleOptions={projectRoleOptions}
                        rolesLoading={rolesLoading}
                        disabled={isSubmitting}
                    />
                )}
            </Stack>
        </form>
    );
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
    serviceAccount: ServiceAccountWithProjectAccessCount | undefined;
};

export const ServiceAccountsEditModal: FC<Props> = ({
    isOpen,
    onClose,
    serviceAccount,
}) => {
    const { updateAccount } = useServiceAccounts();
    // Grants are fetched at the modal level so loading/ready state is derived
    // here at render time (no effects) and the form prefills project access.
    const grantsQuery = useServiceAccountProjectGrants(
        serviceAccount?.uuid ?? '',
    );
    const isSubmitting = updateAccount.isLoading;
    const grantsReady = !grantsQuery.isLoading && !!grantsQuery.data;

    const handleSubmit = useCallback(
        (payload: UpdateServiceAccount) => {
            if (!serviceAccount) return;
            // `mutate` (not `mutateAsync`): success closes the modal, failure
            // surfaces the hook's onError toast and keeps it open.
            updateAccount.mutate(
                { uuid: serviceAccount.uuid, ...payload },
                { onSuccess: () => onClose() },
            );
        },
        [serviceAccount, updateAccount, onClose],
    );

    const renderBody = () => {
        if (!serviceAccount) return null;
        if (grantsQuery.isLoading) {
            return (
                <Center mih={120}>
                    <Loader size="sm" />
                </Center>
            );
        }
        if (grantsQuery.isError || !grantsQuery.data) {
            return (
                <Text size="sm" c="red">
                    Failed to load this service account's project access.
                </Text>
            );
        }
        return (
            <EditForm
                key={serviceAccount.uuid}
                serviceAccount={serviceAccount}
                grants={grantsQuery.data}
                isSubmitting={isSubmitting}
                onSubmit={handleSubmit}
            />
        );
    };

    return (
        <MantineModal
            opened={isOpen}
            onClose={onClose}
            title="Edit service account"
            icon={IconPencil}
            cancelLabel="Cancel"
            cancelDisabled={isSubmitting}
            actions={
                <Button
                    type="submit"
                    form={EDIT_FORM_ID}
                    loading={isSubmitting}
                    disabled={!grantsReady}
                >
                    Save changes
                </Button>
            }
        >
            {renderBody()}
        </MantineModal>
    );
};

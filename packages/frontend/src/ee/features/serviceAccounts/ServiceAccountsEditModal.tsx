import {
    ServiceAccountScope,
    type ProjectMemberRole,
    type ServiceAccountProjectGrant,
    type ServiceAccountScope as ServiceAccountScopeType,
    type ServiceAccountWithProjectAccessCount,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Center,
    Loader,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
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

// A project-scoped SA carries `system:member` + per-project grants. Its mode is
// fixed: this modal edits the project grants, never an org-wide role.
const isProjectScoped = (sa: ServiceAccountWithProjectAccessCount) =>
    sa.scopes.includes(ServiceAccountScope.SYSTEM_MEMBER);

// Resolve the org role Select's initial value: a custom role wins; otherwise a
// single org scope (legacy scopes mapped to their system alias). Multi-scope /
// unmappable SAs start blank, forcing a pick.
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

// Edit always surfaces the org's custom roles (unlike create, which gates them
// behind the feature flag) so an SA already bound to a custom role keeps
// showing that role even if the flag is off.
const useCustomRoleOptions = () => {
    const { listRoles } = useCustomRoles();
    const options = useMemo(
        () =>
            (listRoles.data ?? [])
                .map((role) => ({
                    value: `role:${role.roleUuid}`,
                    label: role.name,
                }))
                .sort((a, b) =>
                    a.label.localeCompare(b.label, undefined, {
                        sensitivity: 'base',
                    }),
                ),
        [listRoles.data],
    );
    return { options, isLoading: listRoles.isLoading };
};

interface EditFormState {
    isLoading: boolean;
    isReady: boolean;
}

const READY: EditFormState = { isLoading: false, isReady: true };

// Organization-scoped SA: edit name + org role / scopes.
const OrgEditForm: FC<{
    serviceAccount: ServiceAccountWithProjectAccessCount;
    onStateChange: (state: EditFormState) => void;
    onClose: () => void;
}> = ({ serviceAccount, onStateChange, onClose }) => {
    const { updateAccount } = useServiceAccounts();
    const { mutateAsync, isLoading } = updateAccount;
    const { options: customRoleOptions, isLoading: rolesLoading } =
        useCustomRoleOptions();

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

    const form = useForm({
        initialValues: {
            description: serviceAccount.description,
            roleSelection: getInitialRoleSelection(serviceAccount),
        },
        validate: {
            roleSelection: (value) =>
                value === '' ? 'Please select a permission set' : null,
        },
    });

    const handleOnSubmit = form.onSubmit(
        async ({ description, roleSelection }) => {
            // `scope:<service-account-scope>` → { scopes: [<scope>] }
            // `role:<uuid>`                   → { roleUuid: <uuid> }
            const { kind, value } = parseTaggedRole(roleSelection);
            const payload =
                kind === 'scope'
                    ? { scopes: [value as ServiceAccountScopeType] }
                    : { roleUuid: value };
            await mutateAsync({
                uuid: serviceAccount.uuid,
                description,
                ...payload,
            });
            onClose();
        },
    );

    useEffect(() => {
        onStateChange({ isLoading, isReady: true });
    }, [isLoading, onStateChange]);

    return (
        <form id={EDIT_FORM_ID} onSubmit={handleOnSubmit}>
            <Stack gap="md">
                <TextInput
                    label="Description"
                    placeholder="What's this service account for?"
                    required
                    disabled={isLoading}
                    {...form.getInputProps('description')}
                />
                <Select
                    label="Role"
                    description={
                        <>
                            Pick a system role or a custom role you've created
                            in{' '}
                            <Anchor
                                component={Link}
                                to="/generalSettings/customRoles"
                                size="xs"
                            >
                                custom roles
                            </Anchor>
                            . The token stays the same.
                        </>
                    }
                    placeholder="Select a permission set"
                    data={roleOptions}
                    required
                    searchable
                    maxDropdownHeight={220}
                    disabled={isLoading || rolesLoading}
                    {...form.getInputProps('roleSelection')}
                />
            </Stack>
        </form>
    );
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

// Inner project form — mounts only once grants are loaded so `useForm` captures
// them as initial values (per the no-effect-sync state pattern).
const ProjectEditFormInner: FC<{
    serviceAccount: ServiceAccountWithProjectAccessCount;
    grants: ServiceAccountProjectGrant[];
    onStateChange: (state: EditFormState) => void;
    onClose: () => void;
}> = ({ serviceAccount, grants, onStateChange, onClose }) => {
    const { updateAccount } = useServiceAccounts();
    const { mutateAsync, isLoading } = updateAccount;
    const { data: projects = [] } = useProjects();
    const { options: customRoleOptions, isLoading: rolesLoading } =
        useCustomRoleOptions();

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
            description: serviceAccount.description,
            projectRoles: grantsToRows(grants),
        },
        validate: {
            projectRoles: (rows) => {
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
        async ({ description, projectRoles }) => {
            const projectAccess = projectRoles.map((r) => {
                const { kind, value } = parseTaggedRole(r.roleSelection);
                return kind === 'role'
                    ? { projectUuid: r.projectUuid, roleUuid: value }
                    : {
                          projectUuid: r.projectUuid,
                          role: value as ProjectMemberRole,
                      };
            });
            await mutateAsync({
                uuid: serviceAccount.uuid,
                description,
                scopes: [ServiceAccountScope.SYSTEM_MEMBER],
                projectAccess,
            });
            onClose();
        },
    );

    useEffect(() => {
        onStateChange({ isLoading, isReady: true });
    }, [isLoading, onStateChange]);

    return (
        <form id={EDIT_FORM_ID} onSubmit={handleOnSubmit}>
            <Stack gap="md">
                <TextInput
                    label="Description"
                    placeholder="What's this service account for?"
                    required
                    disabled={isLoading}
                    {...form.getInputProps('description')}
                />
                <ServiceAccountProjectRoles
                    form={form}
                    projects={projects}
                    projectRoleOptions={projectRoleOptions}
                    rolesLoading={rolesLoading}
                    disabled={isLoading}
                />
            </Stack>
        </form>
    );
};

// Project-scoped SA: fetch its current grants, then render the inner form.
const ProjectEditForm: FC<{
    serviceAccount: ServiceAccountWithProjectAccessCount;
    onStateChange: (state: EditFormState) => void;
    onClose: () => void;
}> = ({ serviceAccount, onStateChange, onClose }) => {
    const grantsQuery = useServiceAccountProjectGrants(serviceAccount.uuid);

    useEffect(() => {
        if (grantsQuery.isLoading) {
            onStateChange({ isLoading: false, isReady: false });
        }
    }, [grantsQuery.isLoading, onStateChange]);

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
        <ProjectEditFormInner
            key={serviceAccount.uuid}
            serviceAccount={serviceAccount}
            grants={grantsQuery.data}
            onStateChange={onStateChange}
            onClose={onClose}
        />
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
    const [formState, setFormState] = useState<EditFormState>(READY);

    const handleClose = useCallback(() => {
        onClose();
        setFormState(READY);
    }, [onClose]);

    const projectScoped = serviceAccount
        ? isProjectScoped(serviceAccount)
        : false;

    return (
        <MantineModal
            opened={isOpen}
            onClose={handleClose}
            title="Edit service account"
            icon={IconPencil}
            size="md"
            cancelLabel="Cancel"
            cancelDisabled={formState.isLoading}
            actions={
                <Button
                    type="submit"
                    form={EDIT_FORM_ID}
                    loading={formState.isLoading}
                    disabled={!formState.isReady}
                >
                    Save changes
                </Button>
            }
        >
            {serviceAccount ? (
                projectScoped ? (
                    <ProjectEditForm
                        key={serviceAccount.uuid}
                        serviceAccount={serviceAccount}
                        onStateChange={setFormState}
                        onClose={handleClose}
                    />
                ) : (
                    <OrgEditForm
                        key={serviceAccount.uuid}
                        serviceAccount={serviceAccount}
                        onStateChange={setFormState}
                        onClose={handleClose}
                    />
                )
            ) : null}
        </MantineModal>
    );
};

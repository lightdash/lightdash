import {
    ServiceAccountScope,
    type ServiceAccountScope as ServiceAccountScopeType,
    type ServiceAccountWithProjectAccessCount,
} from '@lightdash/common';
import {
    Anchor,
    Button,
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
import { useCustomRoles } from '../customRoles/useCustomRoles';
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

// A project-scoped SA carries `system:member` + per-project grants. Editing its
// org-wide permission would orphan those grants, so we only allow renaming it
// here; project access is managed separately.
const isProjectScoped = (sa: ServiceAccountWithProjectAccessCount) =>
    sa.projectAccessCount > 0 ||
    sa.scopes.includes(ServiceAccountScope.SYSTEM_MEMBER);

// Resolve the role Select's initial value from the SA's current permission: a
// custom role wins; otherwise a single org scope (legacy scopes mapped to their
// system alias). Multi-scope / unmappable SAs start blank, forcing a pick.
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

interface EditFormState {
    isLoading: boolean;
}

const EditForm: FC<{
    serviceAccount: ServiceAccountWithProjectAccessCount;
    onStateChange: (state: EditFormState) => void;
    onClose: () => void;
}> = ({ serviceAccount, onStateChange, onClose }) => {
    const { updateAccount } = useServiceAccounts();
    const { mutateAsync, isLoading } = updateAccount;
    const { listRoles } = useCustomRoles();

    const projectScoped = isProjectScoped(serviceAccount);

    // Edit always surfaces the org's custom roles (unlike create, which gates
    // them behind the feature flag) so an SA already bound to a custom role
    // keeps showing that role even if the flag is off.
    const customRoleOptions = useMemo(
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

    const initialRoleSelection = getInitialRoleSelection(serviceAccount);

    const form = useForm({
        initialValues: {
            description: serviceAccount.description,
            roleSelection: initialRoleSelection,
        },
        validate: {
            roleSelection: (value) =>
                !projectScoped && value === ''
                    ? 'Please select a permission set'
                    : null,
        },
    });

    const handleOnSubmit = form.onSubmit(
        async ({ description, roleSelection }) => {
            if (projectScoped) {
                await mutateAsync({ uuid: serviceAccount.uuid, description });
                onClose();
                return;
            }
            // `scope:<service-account-scope>` → { scopes: [<scope>] }
            // `role:<uuid>`                   → { roleUuid: <uuid> }
            const sepIdx = roleSelection.indexOf(':');
            const kind = roleSelection.slice(0, sepIdx) as 'scope' | 'role';
            const value = roleSelection.slice(sepIdx + 1);
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
        onStateChange({ isLoading });
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
                {projectScoped ? (
                    <Text size="xs" c="dimmed">
                        This is a project-scoped service account. Its project
                        access can't be edited here — only its name.
                    </Text>
                ) : (
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
                                . The token stays the same.
                            </>
                        }
                        placeholder="Select a permission set"
                        data={roleOptions}
                        required
                        searchable
                        maxDropdownHeight={220}
                        disabled={isLoading || listRoles.isLoading}
                        {...form.getInputProps('roleSelection')}
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
    const [formState, setFormState] = useState<EditFormState>({
        isLoading: false,
    });

    const handleClose = useCallback(() => {
        onClose();
        setFormState({ isLoading: false });
    }, [onClose]);

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
                >
                    Save changes
                </Button>
            }
        >
            {serviceAccount ? (
                <EditForm
                    key={serviceAccount.uuid}
                    serviceAccount={serviceAccount}
                    onStateChange={setFormState}
                    onClose={handleClose}
                />
            ) : null}
        </MantineModal>
    );
};

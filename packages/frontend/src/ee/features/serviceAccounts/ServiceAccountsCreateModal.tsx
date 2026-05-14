import { ServiceAccountScope } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    CopyButton,
    Select,
    Stack,
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

export const ServiceAccountsCreateModal: FC<Props> = ({
    isOpen,
    onClose,
    onSave,
    isWorking,
    token,
}) => {
    const { listRoles } = useCustomRoles();

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
                value === '' ? 'Please select a permission set' : null,
        },
    });

    const closeModal = () => {
        form.reset();
        onClose();
    };

    const handleOnSubmit = form.onSubmit(
        ({ expiresAt, roleSelection, description }) => {
            // Translate the unified role selection into the API shape:
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
                expiresAt: expiresAt
                    ? addDays(new Date(), expiresAt)
                    : expiresAt,
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
                            disabled={isWorking || listRoles.isLoading}
                            {...form.getInputProps('roleSelection')}
                        />
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

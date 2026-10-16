import {
    CommercialFeatureFlags,
    ServiceAccountScope,
    type ProjectMemberRole,
    type RoleLevel,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconKey } from '@tabler/icons-react';
import { addDays } from 'date-fns';
import { type TFunction } from 'i18next';
import { useMemo, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import Callout from '../../../components/common/Callout';
import { CopyActionIcon } from '../../../components/common/CopyActionIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useProjects } from '../../../hooks/useProjects';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import { useCustomRoles } from '../customRoles/useCustomRoles';
import {
    getSystemRoleOptions,
    SYSTEM_PROJECT_ROLE_OPTIONS,
    type ProjectRoleRow,
} from './projectRoleOptions';
import { ServiceAccountProjectRoles } from './ServiceAccountProjectRoles';

const getExpireOptions = (t: TFunction) => [
    { label: t('expiration.none'), value: '' },
    { label: t('expiration.days', { count: 7 }), value: '7' },
    { label: t('expiration.days', { count: 30 }), value: '30' },
    { label: t('expiration.days', { count: 60 }), value: '60' },
    { label: t('expiration.days', { count: 90 }), value: '90' },
    { label: t('expiration.months', { count: 6 }), value: '180' },
    { label: t('expiration.years', { count: 1 }), value: '365' },
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
    const { t } = useTranslation('serviceAccounts');
    const expireOptions = getExpireOptions(t);
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

    const customRoleOptions = useMemo(() => {
        if (!isCustomRolesEnabled) {
            return {
                organization: [],
                project: [],
            };
        }

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
    }, [listRoles.data, isCustomRolesEnabled]);

    const organizationCustomRoleOptions = customRoleOptions.organization;
    const projectCustomRoleOptions = customRoleOptions.project;

    const roleOptions = useMemo(
        () => [
            {
                group: t('roleGroups.organizationSystem'),
                items: getSystemRoleOptions(t),
            },
            ...(organizationCustomRoleOptions.length > 0
                ? [
                      {
                          group: t('roleGroups.custom'),
                          items: organizationCustomRoleOptions,
                      },
                  ]
                : []),
        ],
        [organizationCustomRoleOptions, t],
    );

    // Per-row role picker for project mode. Same grouped shape as the
    // org-mode role select so the dropdown visually matches and custom
    // roles bubble up below the system list.
    const projectRoleOptions = useMemo(() => {
        const groups: {
            group: string;
            items: { value: string; label: string }[];
        }[] = [
            {
                group: t('roleGroups.system'),
                items: SYSTEM_PROJECT_ROLE_OPTIONS,
            },
        ];
        if (projectCustomRoleOptions.length > 0) {
            groups.push({
                group: t('roleGroups.custom'),
                items: projectCustomRoleOptions,
            });
        }
        return groups;
    }, [projectCustomRoleOptions, t]);

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
                    ? t('validation.selectPermissionSet')
                    : null,
            projectRoles: (rows, values) => {
                if (values.scope !== 'project') return null;
                if (rows.length === 0) return t('validation.addProject');
                if (rows.some((r) => !r.projectUuid))
                    return t('validation.pickProjectEachRow');
                const uniques = new Set(rows.map((r) => r.projectUuid));
                if (uniques.size !== rows.length)
                    return t('validation.projectOnce');
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
            role="alertdialog"
            title={t('createModal.title')}
            icon={IconKey}
            cancelLabel={token ? false : t('actions.cancel', { ns: 'common' })}
            cancelDisabled={isWorking}
            actions={
                !token ? (
                    <Button
                        type="submit"
                        form="create-service-account-form"
                        loading={isWorking}
                    >
                        {t('createModal.create')}
                    </Button>
                ) : (
                    <Button onClick={closeModal}>
                        {t('createModal.done')}
                    </Button>
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
                            label={t('form.description')}
                            placeholder={t('form.descriptionPlaceholder')}
                            required
                            disabled={isWorking}
                            {...form.getInputProps('description')}
                        />
                        <Select
                            defaultValue={expireOptions[0].value}
                            label={t('form.expiration')}
                            data={expireOptions}
                            disabled={isWorking}
                            {...form.getInputProps('expiresAt')}
                        />
                        <Stack gap="xs">
                            <Text size="sm" fw={500}>
                                {t('form.scope')}
                            </Text>
                            <SegmentedControl
                                fullWidth
                                disabled={isWorking}
                                data={[
                                    {
                                        label: t('form.scopeOrganization'),
                                        value: 'organization',
                                    },
                                    {
                                        label: t('form.scopeProject'),
                                        value: 'project',
                                    },
                                ]}
                                {...form.getInputProps('scope')}
                            />
                            <Text size="xs" c="dimmed">
                                {form.values.scope === 'organization'
                                    ? t('form.scopeOrganizationDescription')
                                    : t('form.scopeProjectDescription')}
                            </Text>
                        </Stack>

                        {form.values.scope === 'organization' ? (
                            <Select
                                label={t('form.role')}
                                description={
                                    <Trans
                                        t={t}
                                        i18nKey="form.roleDescription"
                                        components={{
                                            anchor: (
                                                <Anchor
                                                    component={Link}
                                                    to="/generalSettings/customRoles"
                                                    size="xs"
                                                />
                                            ),
                                        }}
                                    />
                                }
                                placeholder={t('form.rolePlaceholder')}
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
                        label={t('createModal.token')}
                        readOnly
                        className="sentry-block ph-no-capture"
                        value={token}
                        rightSection={
                            <CopyActionIcon
                                value={token}
                                tooltipPosition="right"
                            />
                        }
                    />
                    <Callout
                        variant="info"
                        title={t('createModal.copyTokenWarning')}
                    />
                </Stack>
            )}
        </MantineModal>
    );
};

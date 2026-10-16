import {
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    ServiceAccountScope,
} from '@lightdash/common';
import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconKey } from '@tabler/icons-react';
import { addDays } from 'date-fns';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useCallback, useMemo, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useServiceAccounts } from '../../../ee/features/serviceAccounts/useServiceAccounts';
import useToaster from '../../../hooks/toaster/useToaster';
import Callout from '../../common/Callout';
import MantineModal from '../../common/MantineModal';

export type GeneratedToken = {
    token: string;
    description: string;
    expiresLabel: string;
};

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    projectName: string;
    onGenerated: (token: GeneratedToken) => void;
};

const EXPIRE_OPTIONS = [
    { key: 'days7', value: '7' },
    { key: 'days30', value: '30' },
    { key: 'days60', value: '60' },
    { key: 'days90', value: '90' },
    { key: 'months6', value: '180' },
    { key: 'year1', value: '365' },
    { key: 'never', value: '' },
] as const;

// Interactive Viewer is the minimum role that can run semantic-layer queries.
// Lower roles (Viewer) can't, so they're intentionally omitted here.
const ROLE_OPTION_VALUES = [
    ProjectMemberRole.INTERACTIVE_VIEWER,
    ProjectMemberRole.EDITOR,
    ProjectMemberRole.DEVELOPER,
    ProjectMemberRole.ADMIN,
] as const;

export const GenerateTokenModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    projectName,
    onGenerated,
}) => {
    const { createAccount } = useServiceAccounts();
    const { showToastError } = useToaster();
    const { t } = useTranslation('settings');

    const expireOptions = useMemo(
        () =>
            EXPIRE_OPTIONS.map((option) => ({
                value: option.value,
                label: t(`semanticLayer.tokenModal.expiry.${option.key}.label`),
            })),
        [t],
    );

    const roleOptions = useMemo(
        () =>
            ROLE_OPTION_VALUES.map((role) => ({
                value: role,
                label:
                    role === ProjectMemberRole.INTERACTIVE_VIEWER
                        ? t('semanticLayer.tokenModal.roleRecommended', {
                              role: ProjectMemberRoleLabels[role],
                          })
                        : ProjectMemberRoleLabels[role],
            })),
        [t],
    );

    const validationSchema = z.object({
        description: z.string().min(1, {
            message: t('semanticLayer.tokenModal.descriptionRequired'),
        }),
        expiresAt: z.string(),
        role: z.enum(ProjectMemberRole),
    });

    const form = useForm({
        initialValues: {
            description: t('semanticLayer.metricSqlApi'),
            expiresAt: '90',
            role: ProjectMemberRole.INTERACTIVE_VIEWER as ProjectMemberRole,
        },
        validate: zodResolver(validationSchema),
    });

    const expiresLabel = useMemo(() => {
        const option = EXPIRE_OPTIONS.find(
            (o) => o.value === form.values.expiresAt,
        );
        return option
            ? t(`semanticLayer.tokenModal.expiry.${option.key}.expiresIn`)
            : '';
    }, [form.values.expiresAt, t]);

    const handleClose = useCallback(() => {
        form.reset();
        onClose();
    }, [form, onClose]);

    const handleSubmit = form.onSubmit(({ description, expiresAt, role }) => {
        const expiresAtValue = expiresAt
            ? addDays(new Date(), Number(expiresAt))
            : null;

        createAccount.mutate(
            {
                description,
                expiresAt: expiresAtValue,
                // Project-scoped SA: `system:member` + a single project grant.
                scopes: [ServiceAccountScope.SYSTEM_MEMBER],
                projectAccess: [{ projectUuid, role }],
            },
            {
                onSuccess: async (account) => {
                    try {
                        await navigator.clipboard.writeText(account.token);
                    } catch {
                        showToastError({
                            title: t(
                                'semanticLayer.tokenModal.copyFailed.title',
                            ),
                            subtitle: t(
                                'semanticLayer.tokenModal.copyFailed.subtitle',
                            ),
                        });
                    }
                    onGenerated({
                        token: account.token,
                        description,
                        expiresLabel,
                    });
                    form.reset();
                },
            },
        );
    });

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title={t('semanticLayer.tokenModal.title')}
            icon={IconKey}
            size="md"
            cancelLabel={t('actions.cancel', { ns: 'common' })}
            cancelDisabled={createAccount.isLoading}
            actions={
                <Button
                    type="submit"
                    form="generate-pgwire-token-form"
                    loading={createAccount.isLoading}
                >
                    {t('semanticLayer.tokenModal.submit')}
                </Button>
            }
        >
            <Text c="dimmed" fz="sm" mt={-4}>
                {t('semanticLayer.tokenModal.description')}
            </Text>
            <form id="generate-pgwire-token-form" onSubmit={handleSubmit}>
                <Stack gap="md">
                    <TextInput
                        label={t('semanticLayer.tokenModal.descriptionLabel')}
                        placeholder={t(
                            'semanticLayer.tokenModal.descriptionPlaceholder',
                        )}
                        required
                        disabled={createAccount.isLoading}
                        {...form.getInputProps('description')}
                    />
                    <Select
                        label={t('semanticLayer.tokenModal.expiresLabel')}
                        data={expireOptions}
                        allowDeselect={false}
                        disabled={createAccount.isLoading}
                        {...form.getInputProps('expiresAt')}
                    />
                    <Stack gap="xs">
                        <Text fz="sm" fw={500}>
                            {t('semanticLayer.tokenModal.projectRole')}
                        </Text>
                        <Group grow align="flex-start" wrap="nowrap">
                            <TextInput readOnly value={projectName} disabled />
                            <Select
                                data={roleOptions}
                                allowDeselect={false}
                                disabled={createAccount.isLoading}
                                {...form.getInputProps('role')}
                            />
                        </Group>
                    </Stack>
                    <Callout variant="info" hideIcon>
                        <Text fz="sm">
                            <Trans
                                t={t}
                                i18nKey="semanticLayer.tokenModal.roleHint"
                                components={{ bold: <Text span fw={600} /> }}
                            />
                        </Text>
                    </Callout>
                </Stack>
            </form>
        </MantineModal>
    );
};

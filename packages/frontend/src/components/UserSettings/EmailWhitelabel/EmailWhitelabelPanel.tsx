import {
    type EmailDnsRecord,
    type OrganizationEmailWhitelabel,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    Stack,
    Switch,
    Table,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconInfoCircle, IconTrash } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
    useDeleteEmailWhitelabel,
    useEmailWhitelabel,
    useSetupEmailWhitelabel,
    useUpdateEmailWhitelabel,
    useVerifyEmailWhitelabel,
} from '../../../hooks/organization/useEmailWhitelabel';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { SettingsPage } from '../../common/Settings/SettingsPage';

const getStatusBadge = (
    t: TFunction<'userSettings'>,
): Record<
    OrganizationEmailWhitelabel['status'],
    { label: string; color: string }
> => ({
    pending: { label: t('emailWhitelabel.status.pending'), color: 'gray' },
    verified: { label: t('emailWhitelabel.status.verified'), color: 'green' },
    enabled: { label: t('emailWhitelabel.status.enabled'), color: 'green' },
    failed: { label: t('emailWhitelabel.status.failed'), color: 'red' },
});

/**
 * DNS providers manage records relative to the zone (e.g. acmecorp.com), so
 * strip the zone apex from the record's FQDN: entering the full name would
 * create <name>.<zone> instead. Approximates the apex as the last two labels.
 */
const toZoneRelativeName = (recordName: string, sendingDomain: string) => {
    const zoneApex = sendingDomain.split('.').slice(-2).join('.');
    return recordName.endsWith(`.${zoneApex}`)
        ? recordName.slice(0, -(zoneApex.length + 1))
        : recordName;
};

const CopyValue: FC<{ value: string }> = ({ value }) => (
    <Group gap="xs" wrap="nowrap">
        <Text
            size="xs"
            ff="monospace"
            style={{ wordBreak: 'break-all' }}
            flex={1}
        >
            {value}
        </Text>
        <CopyActionIcon value={value} />
    </Group>
);

const DnsRecordsTable: FC<{ records: EmailDnsRecord[]; domain: string }> = ({
    records,
    domain,
}) => {
    const { t } = useTranslation('userSettings');
    return (
        <Table withTableBorder>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>{t('emailWhitelabel.dnsTable.type')}</Table.Th>
                    <Table.Th>
                        {t('emailWhitelabel.dnsTable.nameHost')}
                    </Table.Th>
                    <Table.Th>{t('emailWhitelabel.dnsTable.value')}</Table.Th>
                    <Table.Th>{t('emailWhitelabel.dnsTable.status')}</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {records.map((record) => (
                    <Table.Tr key={`${record.purpose}-${record.name}`}>
                        <Table.Td>
                            <Text size="xs" fw={500}>
                                {record.type}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {record.purpose === 'dkim'
                                    ? 'DKIM'
                                    : 'Return-Path'}
                            </Text>
                        </Table.Td>
                        <Table.Td w={220}>
                            <Tooltip
                                label={t(
                                    'emailWhitelabel.dnsTable.fullRecordName',
                                    {
                                        name: record.name,
                                    },
                                )}
                            >
                                <div>
                                    <CopyValue
                                        value={toZoneRelativeName(
                                            record.name,
                                            domain,
                                        )}
                                    />
                                </div>
                            </Tooltip>
                        </Table.Td>
                        <Table.Td>
                            <CopyValue value={record.value} />
                        </Table.Td>
                        <Table.Td w={100}>
                            <Badge
                                color={record.verified ? 'green' : 'gray'}
                                size="sm"
                            >
                                {record.verified
                                    ? t('emailWhitelabel.dnsTable.verified')
                                    : t('emailWhitelabel.dnsTable.pending')}
                            </Badge>
                        </Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    );
};

const SetupForm: FC = () => {
    const { t } = useTranslation('userSettings');
    const setup = useSetupEmailWhitelabel();
    const form = useForm({
        initialValues: { domain: '', fromEmail: '', fromName: '' },
    });

    const handleDomainBlur = () => {
        // Suggest a from-address at the domain if the user hasn't set one.
        if (form.values.domain && !form.values.fromEmail) {
            form.setFieldValue('fromEmail', `reports@${form.values.domain}`);
        }
    };

    return (
        <form
            onSubmit={form.onSubmit((values) =>
                setup.mutate({
                    domain: values.domain.trim(),
                    fromEmail: values.fromEmail.trim(),
                    fromName: values.fromName.trim() || null,
                }),
            )}
        >
            <Stack gap="md">
                <TextInput
                    label={t('emailWhitelabel.setupForm.sendingDomain')}
                    description={t(
                        'emailWhitelabel.setupForm.sendingDomainDescription',
                    )}
                    placeholder="reports.yourcompany.com"
                    required
                    {...form.getInputProps('domain')}
                    onBlur={handleDomainBlur}
                />
                <TextInput
                    label={t('emailWhitelabel.setupForm.fromAddress')}
                    description={t(
                        'emailWhitelabel.setupForm.fromAddressDescription',
                    )}
                    placeholder="reports@reports.yourcompany.com"
                    required
                    {...form.getInputProps('fromEmail')}
                />
                <TextInput
                    label={t('emailWhitelabel.setupForm.fromName')}
                    description={t(
                        'emailWhitelabel.setupForm.fromNameDescription',
                    )}
                    placeholder={t(
                        'emailWhitelabel.setupForm.fromNamePlaceholder',
                    )}
                    {...form.getInputProps('fromName')}
                />
                <Group justify="flex-end">
                    <Button type="submit" loading={setup.isLoading}>
                        {t('emailWhitelabel.setupForm.submit')}
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

const ConfiguredView: FC<{ config: OrganizationEmailWhitelabel }> = ({
    config,
}) => {
    const verify = useVerifyEmailWhitelabel();
    const update = useUpdateEmailWhitelabel();
    const remove = useDeleteEmailWhitelabel();
    const { t } = useTranslation('userSettings');
    const badge = getStatusBadge(t)[config.status];

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center">
                <Group gap="sm">
                    <Text fw={500}>{config.domain}</Text>
                    <Badge color={badge.color} size="sm">
                        {badge.label}
                    </Badge>
                </Group>
                <Switch
                    label={t('emailWhitelabel.configuredView.sendFromDomain')}
                    checked={config.isEnabled}
                    disabled={!config.isVerified || update.isLoading}
                    onChange={(event) =>
                        update.mutate({
                            isEnabled: event.currentTarget.checked,
                        })
                    }
                />
            </Group>

            <Text size="sm" c="dimmed">
                <Trans
                    t={t}
                    i18nKey="emailWhitelabel.configuredView.instructions"
                    values={{ email: config.fromEmail }}
                    components={{ b: <Text span fw={500} /> }}
                />
            </Text>

            <Stack gap="xs">
                <DnsRecordsTable
                    records={config.dnsRecords}
                    domain={config.domain}
                />

                <Tooltip
                    label={t(
                        'emailWhitelabel.configuredView.cloudflareTooltip',
                    )}
                    w={320}
                >
                    <Group gap={4} w="fit-content">
                        <MantineIcon
                            icon={IconInfoCircle}
                            size="sm"
                            color="dimmed"
                        />
                        <Text size="xs" c="dimmed">
                            {t('emailWhitelabel.configuredView.cloudflareHint')}
                        </Text>
                    </Group>
                </Tooltip>
            </Stack>

            <Group justify="space-between">
                <Button
                    variant="subtle"
                    color="red"
                    size="compact-sm"
                    leftSection={<MantineIcon icon={IconTrash} />}
                    loading={remove.isLoading}
                    onClick={() => remove.mutate()}
                >
                    {t('emailWhitelabel.configuredView.removeDomain')}
                </Button>
                <Button
                    loading={verify.isLoading}
                    disabled={config.isVerified}
                    onClick={() => verify.mutate()}
                >
                    {config.isVerified
                        ? t('emailWhitelabel.configuredView.verified')
                        : t('emailWhitelabel.configuredView.verifyDnsRecords')}
                </Button>
            </Group>
        </Stack>
    );
};

const EmailWhitelabelPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const { data: config, isInitialLoading } = useEmailWhitelabel();

    return (
        <SettingsPage
            title={t('emailWhitelabel.panel.title')}
            description={t('emailWhitelabel.panel.description')}
        >
            <SettingsCard>
                <Stack gap="md">
                    <Text c="dimmed" size="sm">
                        {t('emailWhitelabel.panel.fallbackNotice')}
                    </Text>
                    {isInitialLoading ? (
                        <EmptyStateLoader mih={60} />
                    ) : config ? (
                        <ConfiguredView config={config} />
                    ) : (
                        <SetupForm />
                    )}
                </Stack>
            </SettingsCard>
        </SettingsPage>
    );
};

export default EmailWhitelabelPanel;

import {
    type EmailDnsRecord,
    type OrganizationEmailWhitelabel,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Divider,
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
import { type FC } from 'react';
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
import {
    SettingRow,
    SettingsSection,
} from '../../common/Settings/SettingLayout';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import classes from './EmailWhitelabelPanel.module.css';

const STATUS_BADGE: Record<
    OrganizationEmailWhitelabel['status'],
    { label: string; color: string }
> = {
    pending: { label: 'Pending verification', color: 'gray' },
    verified: { label: 'Verified', color: 'green' },
    enabled: { label: 'Enabled', color: 'green' },
    failed: { label: 'Verification failed', color: 'red' },
};

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
        <Text fz="xs" ff="monospace" className={classes.recordValue} flex={1}>
            {value}
        </Text>
        <CopyActionIcon value={value} />
    </Group>
);

const DnsRecordsTable: FC<{ records: EmailDnsRecord[]; domain: string }> = ({
    records,
    domain,
}) => (
    <Table withTableBorder>
        <Table.Thead>
            <Table.Tr>
                <Table.Th>Type</Table.Th>
                <Table.Th>Name / Host</Table.Th>
                <Table.Th>Value</Table.Th>
                <Table.Th>Status</Table.Th>
            </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
            {records.map((record) => (
                <Table.Tr key={`${record.purpose}-${record.name}`}>
                    <Table.Td>
                        <Text fz="xs" fw={500}>
                            {record.type}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            {record.purpose === 'dkim' ? 'DKIM' : 'Return-Path'}
                        </Text>
                    </Table.Td>
                    <Table.Td w={220}>
                        <Tooltip label={`Full record name: ${record.name}`}>
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
                            {record.verified ? 'Verified' : 'Pending'}
                        </Badge>
                    </Table.Td>
                </Table.Tr>
            ))}
        </Table.Tbody>
    </Table>
);

const SetupForm: FC = () => {
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
                    label="Sending domain"
                    description="We suggest a subdomain like reports.yourcompany.com to keep it isolated from your primary mail reputation."
                    placeholder="reports.yourcompany.com"
                    required
                    {...form.getInputProps('domain')}
                    onBlur={handleDomainBlur}
                />
                <TextInput
                    label="From address"
                    description="Must be an address at the sending domain."
                    placeholder="reports@reports.yourcompany.com"
                    required
                    {...form.getInputProps('fromEmail')}
                />
                <TextInput
                    label="From name"
                    description="Optional display name shown in the From header."
                    placeholder="Your Company Reports"
                    {...form.getInputProps('fromName')}
                />
                <Group justify="flex-end">
                    <Button size="xs" type="submit" loading={setup.isLoading}>
                        Set up domain
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
    const badge = STATUS_BADGE[config.status];

    return (
        <Stack gap="md">
            <SettingRow
                title={config.domain}
                titleAddon={
                    <Badge color={badge.color} size="sm">
                        {badge.label}
                    </Badge>
                }
                description={
                    <>
                        Report emails send from{' '}
                        <Text span inherit fw={500}>
                            {config.fromEmail}
                        </Text>
                        .
                    </>
                }
                control={
                    <Switch
                        label="Send from this domain"
                        labelPosition="left"
                        checked={config.isEnabled}
                        disabled={!config.isVerified || update.isLoading}
                        onChange={(event) =>
                            update.mutate({
                                isEnabled: event.currentTarget.checked,
                            })
                        }
                    />
                }
            />

            <Divider />

            <SettingRow
                title="DNS records"
                description="Add these records at your DNS provider, then verify. Both records must verify before you can enable sending."
                control={
                    <Button
                        size="xs"
                        loading={verify.isLoading}
                        disabled={config.isVerified}
                        onClick={() => verify.mutate()}
                    >
                        {config.isVerified ? 'Verified' : 'Verify DNS records'}
                    </Button>
                }
            />

            <DnsRecordsTable
                records={config.dnsRecords}
                domain={config.domain}
            />

            <Group gap="xs" wrap="nowrap" align="flex-start">
                <MantineIcon icon={IconInfoCircle} size="sm" color="dimmed" />
                <Text fz="xs" c="dimmed" className={classes.measure}>
                    Using Cloudflare? It proxies CNAME records by default, which
                    breaks verification. Set the Return-Path record&apos;s proxy
                    status (orange cloud) to “DNS Only”; it will never verify
                    while proxied.
                </Text>
            </Group>

            <Divider />

            <SettingRow
                title="Remove domain"
                description="Delete this sending domain. Report emails go back to the default sender."
                control={
                    <Button
                        variant="subtle"
                        color="red"
                        size="xs"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        loading={remove.isLoading}
                        onClick={() => remove.mutate()}
                    >
                        Remove domain
                    </Button>
                }
            />
        </Stack>
    );
};

const EmailWhitelabelPanel: FC = () => {
    const { data: config, isInitialLoading } = useEmailWhitelabel();

    return (
        <SettingsPage
            title="Email sending domain"
            description="Send report emails from your own domain. Until it is verified and enabled, emails send from the default address with your address as reply-to."
        >
            {isInitialLoading ? (
                <SettingsCard>
                    <EmptyStateLoader mih={60} />
                </SettingsCard>
            ) : config ? (
                <SettingsCard>
                    <ConfiguredView config={config} />
                </SettingsCard>
            ) : (
                <SettingsSection
                    label="Set up a sending domain"
                    description="Add the domain you want to send from. You'll get DNS records to publish next."
                >
                    <SettingsCard>
                        <SetupForm />
                    </SettingsCard>
                </SettingsSection>
            )}
        </SettingsPage>
    );
};

export default EmailWhitelabelPanel;

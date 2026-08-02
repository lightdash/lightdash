import {
    type EmailDnsRecord,
    type OrganizationEmailWhitelabel,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    CopyButton,
    Group,
    Stack,
    Switch,
    Table,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import {
    IconCheck,
    IconCopy,
    IconInfoCircle,
    IconTrash,
} from '@tabler/icons-react';
import { type FC } from 'react';
import {
    useDeleteEmailWhitelabel,
    useEmailWhitelabel,
    useSetupEmailWhitelabel,
    useUpdateEmailWhitelabel,
    useVerifyEmailWhitelabel,
} from '../../../hooks/organization/useEmailWhitelabel';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { SettingsPage } from '../../common/Settings/SettingsPage';

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
        <Text
            size="xs"
            ff="monospace"
            style={{ wordBreak: 'break-all' }}
            flex={1}
        >
            {value}
        </Text>
        <CopyButton value={value}>
            {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow>
                    <ActionIcon
                        variant="subtle"
                        color={copied ? 'green' : 'gray'}
                        onClick={copy}
                    >
                        <MantineIcon
                            icon={copied ? IconCheck : IconCopy}
                            size="sm"
                        />
                    </ActionIcon>
                </Tooltip>
            )}
        </CopyButton>
    </Group>
);

const DnsRecordsTable: FC<{ records: EmailDnsRecord[]; domain: string }> = ({
    records,
    domain,
}) => (
    <Table withTableBorder verticalSpacing="sm">
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
                        <Text size="xs" fw={500}>
                            {record.type}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {record.purpose === 'dkim' ? 'DKIM' : 'Return-Path'}
                        </Text>
                    </Table.Td>
                    <Table.Td w={220}>
                        <Tooltip
                            label={`Full record name: ${record.name}`}
                            withArrow
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
                            variant="light"
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
                    <Button type="submit" loading={setup.isLoading}>
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
            <Group justify="space-between" align="center">
                <Group gap="sm">
                    <Text fw={500}>{config.domain}</Text>
                    <Badge color={badge.color} variant="light" size="sm">
                        {badge.label}
                    </Badge>
                </Group>
                <Switch
                    label="Send from this domain"
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
                Report emails will send from{' '}
                <Text span fw={500}>
                    {config.fromEmail}
                </Text>
                . Add the DNS records below at your DNS provider, then verify.
                Both records must verify before you can enable sending.
            </Text>

            <Stack gap="xs">
                <DnsRecordsTable
                    records={config.dnsRecords}
                    domain={config.domain}
                />

                <Tooltip
                    label="Cloudflare proxies CNAME records by default, which breaks verification. Edit the Return-Path record in Cloudflare and switch the proxy status (orange cloud) to “DNS Only” — it will never verify while proxied."
                    withArrow
                    multiline
                    w={320}
                >
                    <Group gap={4} w="fit-content">
                        <MantineIcon
                            icon={IconInfoCircle}
                            size="sm"
                            color="ldGray.6"
                        />
                        <Text size="xs" c="dimmed">
                            Using Cloudflare? Set the Return-Path record to DNS
                            Only.
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
                    Remove domain
                </Button>
                <Button
                    loading={verify.isLoading}
                    disabled={config.isVerified}
                    onClick={() => verify.mutate()}
                >
                    {config.isVerified ? 'Verified' : 'Verify DNS records'}
                </Button>
            </Group>
        </Stack>
    );
};

const EmailWhitelabelPanel: FC = () => {
    const { data: config, isInitialLoading } = useEmailWhitelabel();

    return (
        <SettingsPage
            title="Email sending domain"
            description="Send report emails from your own domain instead of a Lightdash address."
        >
            <SettingsCard>
                <Stack gap="md">
                    <Text c="dimmed" size="sm">
                        Until your domain is verified and enabled, emails send
                        from Lightdash with your address as reply-to.
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

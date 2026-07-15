import { subject } from '@casl/ability';
import { CommercialFeatureFlags, ServiceAccountScope } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    CopyButton,
    Group,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconCheck, IconCopy, IconKey } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useServiceAccounts } from '../../../ee/features/serviceAccounts/useServiceAccounts';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../hooks/organization/useOrganizationSettings';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import Callout from '../../common/Callout';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';

type Props = {
    projectUuid: string;
};

const DEFAULT_USER = 'lightdash';
const TOKEN_PLACEHOLDER = '<token>';

const CopyableField: FC<{
    label: string;
    value: string;
    description?: string;
}> = ({ label, value, description }) => (
    <TextInput
        label={label}
        description={description}
        readOnly
        value={value}
        className="sentry-block ph-no-capture"
        rightSection={
            <CopyButton value={value} timeout={2000}>
                {({ copied, copy }) => (
                    <Tooltip
                        label={copied ? 'Copied' : 'Copy'}
                        withArrow
                        position="left"
                    >
                        <ActionIcon
                            color={copied ? 'teal' : 'gray'}
                            variant="subtle"
                            onClick={copy}
                        >
                            <MantineIcon icon={copied ? IconCheck : IconCopy} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </CopyButton>
        }
    />
);

/**
 * Token step for the connection page. The pgwire password is a Lightdash token;
 * a token's plaintext is only ever returned once, at creation. So rather than
 * let the user pick an existing service account (whose token we can't recover),
 * we generate a fresh minimum-scope service account on the spot and reveal its
 * token once. It's lifted to the parent so the snippets can render a
 * ready-to-use password; a page reload clears it.
 */
const GenerateTokenField: FC<{
    generatedToken: string | null;
    onTokenGenerated: (token: string) => void;
}> = ({ generatedToken, onTokenGenerated }) => {
    const { createAccount } = useServiceAccounts();

    const handleGenerateToken = () => {
        createAccount.mutate(
            {
                description: 'Semantic layer Postgres connection',
                expiresAt: null,
                // Minimum permissions needed to run semantic-layer queries.
                scopes: [ServiceAccountScope.SYSTEM_INTERACTIVE_VIEWER],
            },
            {
                onSuccess: (account) => onTokenGenerated(account.token),
            },
        );
    };

    if (generatedToken) {
        return (
            <Stack gap="xs">
                <CopyableField
                    label="Password (token)"
                    value={generatedToken}
                />
                <Callout variant="info">
                    Copy this token now — you won&apos;t be able to see it
                    again. It&apos;s the password for every example below.
                </Callout>
            </Stack>
        );
    }

    return (
        <Group justify="space-between" wrap="nowrap" align="center">
            <Text c="ldGray.6" fz="xs">
                Generate a service account token (created with the minimum scope
                needed to run queries) to use as the password.
            </Text>
            <Button
                variant="default"
                leftSection={<MantineIcon icon={IconKey} />}
                loading={createAccount.isLoading}
                onClick={handleGenerateToken}
                style={{ flexShrink: 0 }}
            >
                Generate token
            </Button>
        </Group>
    );
};

const SemanticLayerConnectionPanel: FC<Props> = ({ projectUuid }) => {
    const { health, user } = useApp();
    const { data: organization } = useOrganization();
    const { data: settings, isLoading: isSettingsLoading } =
        useOrganizationSettings();
    const update = useUpdateOrganizationSettings();

    const organizationUuid = user.data?.organizationUuid;
    const isOrgAdmin =
        user.data?.ability.can(
            'manage',
            subject('Organization', { organizationUuid }),
        ) ?? false;

    // Reflect an in-flight edit optimistically so the toggle doesn't snap back
    // while saving.
    const pending = update.isLoading ? update.variables : undefined;
    const isEnabled =
        pending?.semanticLayerPgwireEnabled ??
        settings?.semanticLayerPgwireEnabled ??
        false;

    const { data: serviceAccountsFlag } = useServerFeatureFlag(
        CommercialFeatureFlags.ServiceAccounts,
    );
    const isServiceAccountsEnabled =
        (health.data?.isServiceAccountEnabled ?? false) ||
        (serviceAccountsFlag?.enabled ?? false);

    // The plaintext token is only returned once, when a service account is
    // generated on the spot. We hold it in memory so the snippets can render a
    // ready-to-use password; a page reload clears it.
    const [generatedToken, setGeneratedToken] = useState<string | null>(null);

    const host = organization?.pgWire?.host ?? '';
    const port = organization?.pgWire?.port ?? null;
    const portString = port !== null ? String(port) : '';
    const token = generatedToken ?? TOKEN_PLACEHOLDER;

    const snippets = useMemo(() => {
        const libpqUrl = `postgresql://${DEFAULT_USER}:${token}@${host}:${portString}/${projectUuid}?sslmode=disable`;
        const psql = `PGPASSWORD=${token} psql -h ${host} -p ${portString} -U ${DEFAULT_USER} -d ${projectUuid} "sslmode=disable"`;
        const jdbc = `jdbc:postgresql://${host}:${portString}/${projectUuid}?sslmode=disable`;
        return { libpqUrl, psql, jdbc };
    }, [host, portString, projectUuid, token]);

    return (
        <Stack gap="sm">
            <SettingsCard mb="lg">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Stack gap="xxs">
                        <Title order={5}>Semantic layer connection</Title>
                        <Text c="ldGray.6" size="sm">
                            Connect BI tools and SQL clients to this
                            project&apos;s semantic layer over the Postgres wire
                            protocol.
                        </Text>
                    </Stack>
                    <Switch
                        checked={isEnabled}
                        disabled={
                            !isOrgAdmin || isSettingsLoading || update.isLoading
                        }
                        onChange={(event) =>
                            update.mutate({
                                semanticLayerPgwireEnabled:
                                    event.currentTarget.checked,
                            })
                        }
                    />
                </Group>
            </SettingsCard>

            {isEnabled && !isOrgAdmin && (
                <SettingsCard mb="lg">
                    <Callout variant="info">
                        Connection details are only visible to organization
                        admins.
                    </Callout>
                </SettingsCard>
            )}

            {isEnabled && isOrgAdmin && (
                <>
                    <SettingsCard mb="lg">
                        <Stack gap="md">
                            <Callout variant="info" title="Before you connect">
                                Only simple <code>SELECT</code> queries against
                                a single explore are supported (no SQL joins),
                                with a default limit of 500 rows. TLS is not yet
                                available, so clients must use{' '}
                                <code>sslmode=disable</code>.
                            </Callout>

                            <Title order={6}>Connection details</Title>
                            <Group grow align="flex-start" wrap="nowrap">
                                <CopyableField label="Host" value={host} />
                                <CopyableField
                                    label="Port"
                                    value={portString}
                                />
                            </Group>
                            <CopyableField
                                label="Database"
                                description="Use the project UUID (unambiguous)."
                                value={projectUuid}
                            />
                            <Group grow align="flex-start" wrap="nowrap">
                                <CopyableField
                                    label="User"
                                    description="Not enforced — any value works."
                                    value={DEFAULT_USER}
                                />
                                <Select
                                    label="SSL mode"
                                    description="SSL support is coming soon."
                                    data={[
                                        { value: 'disable', label: 'disable' },
                                    ]}
                                    value="disable"
                                    disabled
                                />
                            </Group>
                        </Stack>
                    </SettingsCard>

                    <SettingsCard mb="lg">
                        <Stack gap="md">
                            <Stack gap="xxs">
                                <Title order={6}>Authentication</Title>
                                <Text c="ldGray.6" fz="sm">
                                    Use a service account token (
                                    <code>ldsvc_...</code>) or a personal access
                                    token (<code>ldpat_...</code>) as the
                                    password.
                                </Text>
                            </Stack>
                            {isServiceAccountsEnabled ? (
                                <GenerateTokenField
                                    generatedToken={generatedToken}
                                    onTokenGenerated={setGeneratedToken}
                                />
                            ) : (
                                <Text c="ldGray.6" fz="xs">
                                    Paste a personal access token from your
                                    account settings to use as the password in
                                    the examples below.
                                </Text>
                            )}
                        </Stack>
                    </SettingsCard>

                    <SettingsCard mb="lg">
                        <Stack gap="md">
                            <Title order={6}>Ready-to-copy examples</Title>
                            <CopyableField
                                label="Connection URL"
                                value={snippets.libpqUrl}
                            />
                            <CopyableField label="psql" value={snippets.psql} />
                            <CopyableField
                                label="JDBC (DBeaver / DataGrip)"
                                value={snippets.jdbc}
                            />
                        </Stack>
                    </SettingsCard>
                </>
            )}
        </Stack>
    );
};

export default SemanticLayerConnectionPanel;

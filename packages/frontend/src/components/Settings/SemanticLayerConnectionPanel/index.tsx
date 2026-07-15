import { subject } from '@casl/ability';
import { CommercialFeatureFlags } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    CopyButton,
    Group,
    Select,
    Stack,
    Switch,
    Tabs,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../hooks/organization/useOrganizationSettings';
import { useProject } from '../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import Callout from '../../common/Callout';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { GenerateTokenModal, type GeneratedToken } from './GenerateTokenModal';
import classes from './SemanticLayerConnectionPanel.module.css';

type Props = {
    projectUuid: string;
};

const DEFAULT_USER = 'lightdash';
const TOKEN_PLACEHOLDER = '<token>';

type SnippetKey = 'libpqUrl' | 'psql' | 'jdbc';

const SNIPPET_TABS: { value: SnippetKey; label: string }[] = [
    { value: 'libpqUrl', label: 'Connection URL' },
    { value: 'psql', label: 'psql' },
    { value: 'jdbc', label: 'JDBC' },
];

// Keep the token recognisable (prefix + last 4) while hiding the secret body,
// so it's safe to show on screen shares yet still identifiable.
const maskToken = (token: string) => {
    if (token.length <= 10) return '•'.repeat(token.length);
    return `${token.slice(0, 6)}${'•'.repeat(12)}${token.slice(-4)}`;
};

const CopyIconButton: FC<{ value: string }> = ({ value }) => (
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
);

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
        rightSection={<CopyIconButton value={value} />}
    />
);

const Step: FC<{
    index: number;
    active: boolean;
    title: string;
    description?: ReactNode;
    children: ReactNode;
}> = ({ index, active, title, description, children }) => (
    <Box className={classes.step}>
        <Box
            className={`${classes.bullet} ${
                active ? classes.bulletActive : classes.bulletInactive
            }`}
        >
            {index}
        </Box>
        <Box className={classes.content}>
            <Stack gap="xs">
                <Stack gap={2}>
                    <Title order={6}>{title}</Title>
                    {description && (
                        <Text c="ldGray.6" fz="sm">
                            {description}
                        </Text>
                    )}
                </Stack>
                {children}
            </Stack>
        </Box>
    </Box>
);

const CodeBlock: FC<{ displayValue: ReactNode; copyValue: string }> = ({
    displayValue,
    copyValue,
}) => (
    <Box className={`${classes.codeBlock} sentry-block ph-no-capture`}>
        {displayValue}
        <Box className={classes.codeBlockCopy}>
            <CopyButton value={copyValue} timeout={2000}>
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
        </Box>
    </Box>
);

const SemanticLayerConnectionPanel: FC<Props> = ({ projectUuid }) => {
    const { health, user } = useApp();
    const { data: organization } = useOrganization();
    const { data: project } = useProject(projectUuid);
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
    // generated on the spot. `manualToken` holds a token the user pasted;
    // `generated` holds one we minted (which we mask and can't recover). Either
    // feeds the snippets; a page reload clears both.
    const [manualToken, setManualToken] = useState('');
    const [generated, setGenerated] = useState<GeneratedToken | null>(null);
    const [isModalOpen, setModalOpen] = useState(false);
    const [activeSnippet, setActiveSnippet] = useState<SnippetKey>('libpqUrl');

    const activeToken = generated?.token ?? manualToken;
    const hasToken = activeToken.length > 0;
    const tokenForSnippet = activeToken || TOKEN_PLACEHOLDER;

    const host = organization?.pgWire?.host ?? '';
    const port = organization?.pgWire?.port ?? null;
    const portString = port !== null ? String(port) : '';

    const snippets = useMemo<Record<SnippetKey, string>>(() => {
        const libpqUrl = `postgresql://${DEFAULT_USER}:${tokenForSnippet}@${host}:${portString}/${projectUuid}?sslmode=disable`;
        const psql = `PGPASSWORD=${tokenForSnippet} psql -h ${host} -p ${portString} -U ${DEFAULT_USER} -d ${projectUuid} "sslmode=disable"`;
        const jdbc = `jdbc:postgresql://${host}:${portString}/${projectUuid}?sslmode=disable`;
        return { libpqUrl, psql, jdbc };
    }, [host, portString, projectUuid, tokenForSnippet]);

    // The visible snippet blots out the token so it's safe on screen, while the
    // copy button still yields the exact, ready-to-paste string.
    const displaySnippet = useMemo<ReactNode>(() => {
        const snippet = snippets[activeSnippet];
        if (!hasToken || !snippet.includes(activeToken)) return snippet;
        const [before, after] = snippet.split(activeToken);
        return (
            <>
                {before}
                <Text span className={classes.codeMask}>
                    {maskToken(activeToken)}
                </Text>
                {after}
            </>
        );
    }, [snippets, activeSnippet, hasToken, activeToken]);

    const handleReplace = () => {
        setGenerated(null);
        setManualToken('');
    };

    return (
        <Stack gap="sm">
            <SettingsCard>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Stack gap="xxs">
                        <Title order={5}>Semantic layer connection</Title>
                        <Text c="ldGray.6" size="sm">
                            Connect BI tools and SQL clients over the Postgres
                            wire protocol. Follow the three steps below.
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
                <SettingsCard>
                    <Callout variant="info">
                        Connection details are only visible to organization
                        admins.
                    </Callout>
                </SettingsCard>
            )}

            {isEnabled && isOrgAdmin && (
                <SettingsCard>
                    <Stack gap="lg">
                        <Callout variant="info" title="Before you connect">
                            Only simple <code>SELECT</code> queries against a
                            single explore are supported (no SQL joins), with a
                            default limit of 500 rows. TLS is not yet available,
                            so clients must use <code>sslmode=disable</code>.
                        </Callout>

                        <Step
                            index={1}
                            active
                            title="Token"
                            description="Paste an existing Lightdash token or generate a new one for this integration. You can use a service account or personal access token."
                        >
                            {generated ? (
                                <Stack gap="xs">
                                    <Callout variant="success" hideIcon>
                                        <Group
                                            justify="space-between"
                                            wrap="nowrap"
                                            align="flex-start"
                                        >
                                            <Group gap="xs" wrap="nowrap">
                                                <MantineIcon
                                                    icon={IconCheck}
                                                    color="green"
                                                />
                                                <Stack gap={0}>
                                                    <Text fz="sm" fw={600}>
                                                        Token added as your
                                                        password
                                                    </Text>
                                                    <Text c="ldGray.6" fz="xs">
                                                        Generated for{' '}
                                                        {generated.description}{' '}
                                                        ·{' '}
                                                        {generated.expiresLabel}
                                                    </Text>
                                                </Stack>
                                            </Group>
                                            <Anchor
                                                component="button"
                                                type="button"
                                                fz="sm"
                                                fw={500}
                                                onClick={handleReplace}
                                                style={{ flexShrink: 0 }}
                                            >
                                                Replace
                                            </Anchor>
                                        </Group>
                                    </Callout>
                                    <Group gap="xs" wrap="nowrap">
                                        <TextInput
                                            readOnly
                                            style={{ flex: 1 }}
                                            className="sentry-block ph-no-capture"
                                            value={maskToken(generated.token)}
                                        />
                                        <CopyButton
                                            value={generated.token}
                                            timeout={2000}
                                        >
                                            {({ copied, copy }) => (
                                                <Button
                                                    variant="default"
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={
                                                                copied
                                                                    ? IconCheck
                                                                    : IconCopy
                                                            }
                                                        />
                                                    }
                                                    onClick={copy}
                                                >
                                                    {copied ? 'Copied' : 'Copy'}
                                                </Button>
                                            )}
                                        </CopyButton>
                                    </Group>
                                    <Text c="ldGray.6" fz="xs">
                                        Remember to save your token — you
                                        can&apos;t access it again.
                                    </Text>
                                </Stack>
                            ) : (
                                <Stack gap="xs">
                                    <TextInput
                                        placeholder="ldsvc_… or ldpat_…"
                                        className="sentry-block ph-no-capture"
                                        value={manualToken}
                                        onChange={(event) =>
                                            setManualToken(
                                                event.currentTarget.value.trim(),
                                            )
                                        }
                                        rightSection={
                                            manualToken ? (
                                                <CopyIconButton
                                                    value={manualToken}
                                                />
                                            ) : undefined
                                        }
                                    />
                                    {isServiceAccountsEnabled ? (
                                        <Text c="ldGray.6" fz="sm">
                                            Don&apos;t have a token?{' '}
                                            <Anchor
                                                component="button"
                                                type="button"
                                                fw={500}
                                                onClick={() =>
                                                    setModalOpen(true)
                                                }
                                            >
                                                Generate a new one
                                            </Anchor>
                                        </Text>
                                    ) : (
                                        <Text c="ldGray.6" fz="sm">
                                            Paste a personal access token from
                                            your account settings.
                                        </Text>
                                    )}
                                </Stack>
                            )}
                        </Step>

                        <Step
                            index={2}
                            active={false}
                            title="Connection details"
                        >
                            <Stack gap="sm">
                                <CopyableField label="Host" value={host} />
                                <Group grow align="flex-start" wrap="nowrap">
                                    <CopyableField
                                        label="Port"
                                        value={portString}
                                    />
                                    <CopyableField
                                        label="User"
                                        description="Not enforced — any value works."
                                        value={DEFAULT_USER}
                                    />
                                </Group>
                                <CopyableField
                                    label="Database"
                                    description="Use the project UUID (unambiguous)."
                                    value={projectUuid}
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
                            </Stack>
                        </Step>

                        <Step
                            index={3}
                            active={false}
                            title="Connect your client"
                            description="Pick your tool and copy the ready-made string."
                        >
                            <Stack gap="sm">
                                <Tabs
                                    value={activeSnippet}
                                    onChange={(value) =>
                                        setActiveSnippet(value as SnippetKey)
                                    }
                                >
                                    <Tabs.List>
                                        {SNIPPET_TABS.map((tab) => (
                                            <Tabs.Tab
                                                key={tab.value}
                                                value={tab.value}
                                            >
                                                {tab.label}
                                            </Tabs.Tab>
                                        ))}
                                    </Tabs.List>
                                </Tabs>
                                <CodeBlock
                                    displayValue={displaySnippet}
                                    copyValue={snippets[activeSnippet]}
                                />
                            </Stack>
                        </Step>
                    </Stack>
                </SettingsCard>
            )}

            <GenerateTokenModal
                opened={isModalOpen}
                onClose={() => setModalOpen(false)}
                projectUuid={projectUuid}
                projectName={project?.name ?? ''}
                onGenerated={(token) => {
                    setManualToken('');
                    setGenerated(token);
                    setModalOpen(false);
                }}
            />
        </Stack>
    );
};

export default SemanticLayerConnectionPanel;

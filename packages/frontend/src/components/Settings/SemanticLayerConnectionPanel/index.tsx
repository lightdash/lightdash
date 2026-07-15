import { subject } from '@casl/ability';
import { CommercialFeatureFlags } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    CopyButton,
    Group,
    PasswordInput,
    Stack,
    Switch,
    Tabs,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconCheck,
    IconCircleCheckFilled,
    IconCopy,
} from '@tabler/icons-react';
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

const ConnectionChip: FC<{ label: string; value: string; span?: boolean }> = ({
    label,
    value,
    span = false,
}) => (
    <Box
        className={`${classes.chip}${
            span ? ` ${classes.chipSpan2}` : ''
        } sentry-block ph-no-capture`}
    >
        <Box className={classes.chipText}>
            <Text className={classes.chipLabel}>{label}</Text>
            <Text className={classes.chipValue} title={value}>
                {value}
            </Text>
        </Box>
        <CopyButton value={value} timeout={2000}>
            {({ copied, copy }) => (
                <Tooltip
                    label={copied ? 'Copied' : 'Copy'}
                    withArrow
                    position="left"
                >
                    <ActionIcon variant="default" size="sm" onClick={copy}>
                        <MantineIcon
                            icon={copied ? IconCheck : IconCopy}
                            size="sm"
                        />
                    </ActionIcon>
                </Tooltip>
            )}
        </CopyButton>
    </Box>
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

// One connected green card: header, the masked token, its copy button, and the
// reminder all live inside the same success-tinted surface so they read as a
// single unit.
const TokenAddedCard: FC<{
    generated: GeneratedToken;
    onReplace: () => void;
}> = ({ generated, onReplace }) => {
    const masked = maskToken(generated.token);
    return (
        <Box className={classes.tokenCard}>
            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Group gap="xs" wrap="nowrap" align="flex-start">
                    <MantineIcon
                        icon={IconCircleCheckFilled}
                        color="green"
                        size="lg"
                    />
                    <Box>
                        <Text className={classes.tokenCardTitle}>
                            Token added as your password
                        </Text>
                        <Text className={classes.tokenCardMeta}>
                            Generated for {generated.description} ·{' '}
                            {generated.expiresLabel}
                        </Text>
                    </Box>
                </Group>
                <Anchor
                    component="button"
                    type="button"
                    fz="sm"
                    fw={500}
                    onClick={onReplace}
                    style={{ flexShrink: 0 }}
                >
                    Replace
                </Anchor>
            </Group>
            <Group gap="xs" wrap="nowrap" align="stretch" mt="sm">
                <Box
                    className={`${classes.tokenField} sentry-block ph-no-capture`}
                    title={masked}
                >
                    {masked}
                </Box>
                <CopyButton value={generated.token} timeout={2000}>
                    {({ copied, copy }) => (
                        <UnstyledButton
                            className={classes.tokenCopyBtn}
                            onClick={copy}
                        >
                            <MantineIcon
                                icon={copied ? IconCheck : IconCopy}
                                size="sm"
                            />
                            {copied ? 'Copied' : 'Copy'}
                        </UnstyledButton>
                    )}
                </CopyButton>
            </Group>
            <Text className={classes.tokenCardHint} mt="xs">
                Remember to save your token — you can&apos;t access it again.
            </Text>
        </Box>
    );
};

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
                        <Title order={5}>Metric SQL API</Title>
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
                <SettingsCard p="lg">
                    <Stack gap="lg">
                        <Callout variant="info" title="Before you connect">
                            Only simple <code>SELECT</code> queries against a
                            single explore are supported (no SQL joins), with a
                            default limit of 500 rows. TLS is not yet available,
                            so clients must use <code>sslmode=disable</code>.
                        </Callout>

                        <Box>
                            <Step
                                index={1}
                                active
                                title="Token"
                                description="Paste an existing Lightdash token or generate a new one for this integration. You can use a service account or personal access token."
                            >
                                {generated ? (
                                    <TokenAddedCard
                                        generated={generated}
                                        onReplace={handleReplace}
                                    />
                                ) : (
                                    <Stack gap="xs">
                                        <PasswordInput
                                            placeholder="ldsvc_… or ldpat_…"
                                            className="sentry-block ph-no-capture"
                                            value={manualToken}
                                            onChange={(event) =>
                                                setManualToken(
                                                    event.currentTarget.value.trim(),
                                                )
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
                                                Paste a personal access token
                                                from your account settings.
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
                                <Box className={classes.chipGrid}>
                                    <ConnectionChip
                                        label="Host"
                                        value={host}
                                        span
                                    />
                                    <ConnectionChip
                                        label="Port"
                                        value={portString}
                                    />
                                    <ConnectionChip
                                        label="User"
                                        value={DEFAULT_USER}
                                    />
                                    <ConnectionChip
                                        label="Database"
                                        value={projectUuid}
                                        span
                                    />
                                    <ConnectionChip
                                        label="SSL mode"
                                        value="disable"
                                    />
                                </Box>
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
                                        onChange={(value) => {
                                            if (value)
                                                setActiveSnippet(
                                                    value as SnippetKey,
                                                );
                                        }}
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
                        </Box>
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

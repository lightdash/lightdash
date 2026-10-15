import {
    type OrganizationAgentIdentitySnowflakeSetup,
    type OrganizationAgentIdentitySnowflakeVerify,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconCheck, IconMinus, IconX } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import MantineIcon from '../../components/common/MantineIcon';
import { useSettingsContext } from '../../hooks/settings/useSettingsContext';
import { AgentSetupStep } from './AgentSetupStep';
import { useSnowflakeAgentSetup, useSnowflakeAgentVerify } from './api';
import { SnowflakeAgentClient } from './SnowflakeAgentClient';

const checkAppearance = {
    passed: { icon: IconCheck, color: 'green', labelKey: 'passed' },
    failed: { icon: IconX, color: 'red', labelKey: 'failed' },
    not_checked: { icon: IconMinus, color: 'dimmed', labelKey: 'notChecked' },
} as const;

const SnowflakeSetupSteps = ({
    setup,
    verification,
    verifying,
    onVerify,
    onClientSave,
}: {
    setup: OrganizationAgentIdentitySnowflakeSetup;
    verification: OrganizationAgentIdentitySnowflakeVerify | null;
    verifying: boolean;
    onVerify: () => void;
    onClientSave: () => void;
}) => {
    const { t } = useTranslation('aiAccess');
    const { showMyAgentConnections } = useSettingsContext();
    return (
        <Stack gap="lg">
            <AgentSetupStep
                number={1}
                title={t('snowflakeSetup.step1')}
                done={setup.configured}
            >
                <CodeBlock
                    language="sql"
                    code={setup.integrationSql}
                    copyLabel={t('snowflakeSetup.copyIntegrationSql')}
                />
            </AgentSetupStep>
            <AgentSetupStep
                number={2}
                title={t('snowflakeSetup.step2')}
                done={setup.configured}
            >
                <Stack gap="xs">
                    <SnowflakeAgentClient
                        client={setup.client}
                        onSave={onClientSave}
                    />
                    {setup.missingSettings.includes('Enterprise licence') && (
                        <Text size="sm" c="orange">
                            {t('snowflakeSetup.missingLicence')}
                        </Text>
                    )}
                </Stack>
            </AgentSetupStep>
            <AgentSetupStep
                number={3}
                title={t('snowflakeSetup.step3')}
                done={verification?.passed === true}
                action={
                    <Button
                        variant="default"
                        loading={verifying}
                        onClick={onVerify}
                    >
                        {t('snowflakeSetup.verifyIntegration')}
                    </Button>
                }
            >
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        {t('snowflakeSetup.verifyDescription')}
                    </Text>
                    {verification?.checks.map((check) => {
                        const appearance = checkAppearance[check.status];
                        const statusLabel = t(
                            `snowflakeSetup.checkStatus.${appearance.labelKey}`,
                        );
                        return (
                            <Group
                                key={check.id}
                                align="flex-start"
                                wrap="nowrap"
                                gap="xs"
                            >
                                <MantineIcon
                                    icon={appearance.icon}
                                    color={appearance.color}
                                    aria-label={statusLabel}
                                />
                                <Stack gap={0}>
                                    <Text size="sm" fw={500}>
                                        {check.label} · {statusLabel}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        {check.detail}
                                    </Text>
                                    {check.id === 'agent_session' &&
                                        check.status === 'not_checked' &&
                                        showMyAgentConnections && (
                                            <Anchor
                                                component={Link}
                                                to="/generalSettings/myAgentConnections"
                                                size="sm"
                                            >
                                                {t(
                                                    'snowflakeSetup.myAgentIdentity',
                                                )}
                                            </Anchor>
                                        )}
                                </Stack>
                            </Group>
                        );
                    })}
                </Stack>
            </AgentSetupStep>
        </Stack>
    );
};

const SnowflakeIntegrationStatus = ({
    verified,
    needsAttention,
    verification,
    expanded,
    onToggle,
}: {
    verified: boolean;
    needsAttention: boolean;
    verification: OrganizationAgentIdentitySnowflakeVerify | null;
    expanded: boolean;
    onToggle: () => void;
}) => {
    const { t } = useTranslation('aiAccess');
    return (
        <Group justify="space-between">
            <Group gap="xs">
                <MantineIcon
                    icon={verified ? IconCheck : IconMinus}
                    color={verified ? 'green' : 'orange'}
                />
                <Text size="sm" c={verified ? 'green' : 'orange'}>
                    {verified
                        ? t('snowflakeSetup.statusVerified')
                        : needsAttention
                          ? t('snowflakeSetup.statusNeedsAttention')
                          : t('snowflakeSetup.statusChecking')}
                    {verification &&
                        t('snowflakeSetup.checkedAgo', {
                            ago: formatDistanceToNow(
                                new Date(verification.checkedAt),
                                { addSuffix: true },
                            ),
                        })}
                </Text>
            </Group>
            <Button variant="subtle" size="xs" onClick={onToggle}>
                {expanded
                    ? t('identityChip.hideSetup')
                    : t('identityChip.viewSetup')}
            </Button>
        </Group>
    );
};

const SnowflakeSetupContent = ({
    setup,
    verify,
    compactConfirm,
    onClientSave,
}: {
    setup: ReturnType<typeof useSnowflakeAgentSetup>;
    verify: ReturnType<typeof useSnowflakeAgentVerify>;
    compactConfirm: boolean;
    onClientSave: () => void;
}) => {
    const { t } = useTranslation('aiAccess');
    if (setup.isLoading) return <EmptyStateLoader />;
    if (setup.isError)
        return (
            <InlineErrorState
                message={t('snowflakeSetup.loadError')}
                onRetry={() => void setup.refetch()}
            />
        );
    if (!setup.data) return null;
    if (compactConfirm)
        return <Text size="sm">{t('snowflakeSetup.compactConfirm')}</Text>;
    return (
        <SnowflakeSetupSteps
            setup={setup.data}
            verification={verify.data ?? null}
            verifying={verify.isFetching}
            onVerify={() => void verify.refetch()}
            onClientSave={onClientSave}
        />
    );
};

const SnowflakeSetupActions = ({
    saving,
    onCancel,
    onTurnOn,
    compactConfirm,
    setupLoading,
    setupError,
    verifying,
    verified,
}: {
    saving: boolean;
    onCancel: () => void;
    onTurnOn: () => void;
    compactConfirm: boolean;
    setupLoading: boolean;
    setupError: boolean;
    verifying: boolean;
    verified: boolean;
}) => {
    const { t } = useTranslation('aiAccess');
    return (
        <>
            {!compactConfirm && (
                <Text size="sm" c="dimmed">
                    {t('snowflakeSetup.untilVerified')}
                </Text>
            )}
            <Group justify="flex-end">
                <Button variant="default" disabled={saving} onClick={onCancel}>
                    {t('actions.cancel', { ns: 'common' })}
                </Button>
                <Button
                    loading={saving}
                    disabled={
                        setupLoading ||
                        setupError ||
                        verifying ||
                        (!compactConfirm && !verified)
                    }
                    onClick={onTurnOn}
                >
                    {t('snowflakeSetup.turnOn')}
                </Button>
            </Group>
        </>
    );
};

type Props =
    | {
          mode: 'active';
          verify: ReturnType<typeof useSnowflakeAgentVerify>;
          expanded: boolean | null;
          onToggle: () => void;
      }
    | {
          mode: 'pending';
          saving: boolean;
          onCancel: () => void;
          onTurnOn: () => void;
      };

const SnowflakeSetupHeader = ({
    compactConfirm,
    pending,
}: {
    compactConfirm: boolean;
    pending: boolean;
}) => {
    const { t } = useTranslation('aiAccess');
    return (
        <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap">
                <Title order={5}>
                    {compactConfirm
                        ? t('snowflakeSetup.turnOnTitle')
                        : t('snowflakeSetup.setupTitle')}
                </Title>
                {pending && (
                    <Badge color="orange" variant="light">
                        {t('snowflakeSetup.notActiveYet')}
                    </Badge>
                )}
            </Group>
            {!compactConfirm && (
                <Text size="sm" c="dimmed">
                    {t('snowflakeSetup.runOnce')}
                </Text>
            )}
        </Stack>
    );
};

const SnowflakeAgentSetupContent = (
    props: Props & { verify: ReturnType<typeof useSnowflakeAgentVerify> },
) => {
    const { t } = useTranslation('aiAccess');
    const { verify } = props;
    const setup = useSnowflakeAgentSetup();
    const [clientEdited, setClientEdited] = useState(false);
    const needsAttention = verify.isError || verify.data?.passed === false;
    const open =
        props.mode === 'pending' ||
        (props.expanded ?? (needsAttention && !setup.isLoading));
    const compactConfirm =
        props.mode === 'pending' &&
        !clientEdited &&
        setup.data?.configured === true;
    const verified = !verify.isError && verify.data?.passed === true;
    if (!open) return null;
    return (
        <Stack gap="sm">
            {props.mode === 'active' && (
                <SnowflakeIntegrationStatus
                    verified={verified}
                    needsAttention={needsAttention}
                    verification={verify.data ?? null}
                    expanded={open}
                    onToggle={props.onToggle}
                />
            )}
            <Paper withBorder p="md" radius="md">
                <Stack gap="md">
                    <SnowflakeSetupHeader
                        compactConfirm={compactConfirm}
                        pending={props.mode === 'pending'}
                    />
                    <SnowflakeSetupContent
                        setup={setup}
                        verify={verify}
                        compactConfirm={compactConfirm}
                        onClientSave={() => setClientEdited(true)}
                    />
                    {verify.isError && (
                        <Text size="sm" c="red" role="alert">
                            {t('snowflakeSetup.verifyError')}
                        </Text>
                    )}
                    {props.mode === 'pending' && (
                        <SnowflakeSetupActions
                            saving={props.saving}
                            onCancel={props.onCancel}
                            onTurnOn={props.onTurnOn}
                            compactConfirm={compactConfirm}
                            setupLoading={setup.isLoading}
                            setupError={setup.isError}
                            verifying={verify.isFetching}
                            verified={verified}
                        />
                    )}
                </Stack>
            </Paper>
        </Stack>
    );
};

const PendingSnowflakeAgentSetup = (
    props: Extract<Props, { mode: 'pending' }>,
) => {
    const verify = useSnowflakeAgentVerify(false);
    return <SnowflakeAgentSetupContent {...props} verify={verify} />;
};

export const SnowflakeAgentSetup = (props: Props) =>
    props.mode === 'active' ? (
        <SnowflakeAgentSetupContent {...props} />
    ) : (
        <PendingSnowflakeAgentSetup {...props} />
    );

import {
    type OrganizationAgentIdentitySnowflakeSetup,
    type OrganizationAgentIdentitySnowflakeVerify,
} from '@lightdash/common';
import { Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconCheck, IconMinus, IconX } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import MantineIcon from '../../components/common/MantineIcon';
import { AgentSetupStep } from './AgentSetupStep';
import { useSnowflakeAgentSetup, useSnowflakeAgentVerify } from './api';
import { SnowflakeAgentClient } from './SnowflakeAgentClient';

const checkAppearance = {
    passed: { icon: IconCheck, color: 'green', label: 'Passed' },
    failed: { icon: IconX, color: 'red', label: 'Failed' },
    not_checked: { icon: IconMinus, color: 'dimmed', label: 'Not checked' },
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
    const [copied, setCopied] = useState(false);
    return (
        <Stack gap="lg">
            <AgentSetupStep
                number={1}
                title="Copy and run in Snowflake"
                done={copied || setup.configured}
            >
                <CodeBlock
                    language="sql"
                    code={setup.integrationSql}
                    copyLabel="Copy integration SQL"
                    onCopy={() => setCopied(true)}
                />
            </AgentSetupStep>
            <AgentSetupStep
                number={2}
                title="Paste what Snowflake returned"
                done={setup.configured}
            >
                <Stack gap="xs">
                    <SnowflakeAgentClient
                        client={setup.client}
                        onSave={onClientSave}
                    />
                    {setup.missingSettings.includes('Enterprise licence') && (
                        <Text size="sm" c="orange">
                            Missing: Enterprise licence
                        </Text>
                    )}
                </Stack>
            </AgentSetupStep>
            <AgentSetupStep
                number={3}
                title="Verify"
                done={verification?.passed === true}
                action={
                    <Button
                        variant="default"
                        loading={verifying}
                        onClick={onVerify}
                    >
                        Verify integration
                    </Button>
                }
            >
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        Checks the integration exists and marks sessions as
                        agent sessions.
                    </Text>
                    {verification?.checks.map((check) => {
                        const appearance = checkAppearance[check.status];
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
                                    aria-label={appearance.label}
                                />
                                <Stack gap={0}>
                                    <Text size="sm" fw={500}>
                                        {check.label} · {appearance.label}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        {check.detail}
                                    </Text>
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
}) => (
    <Group justify="space-between">
        <Group gap="xs">
            <MantineIcon
                icon={verified ? IconCheck : IconMinus}
                color={verified ? 'green' : 'orange'}
            />
            <Text size="sm" c={verified ? 'green' : 'orange'}>
                {verified
                    ? 'Verified · Snowflake agent integration'
                    : needsAttention
                      ? 'Snowflake agent integration needs attention'
                      : 'Checking Snowflake agent integration'}
                {verification &&
                    ` · checked ${formatDistanceToNow(new Date(verification.checkedAt), { addSuffix: true })}`}
            </Text>
        </Group>
        <Button variant="subtle" size="xs" onClick={onToggle}>
            {expanded ? 'Hide setup' : 'View setup'}
        </Button>
    </Group>
);

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
    if (setup.isLoading) return <EmptyStateLoader />;
    if (setup.isError)
        return (
            <InlineErrorState
                message="Could not load the Snowflake setup."
                onRetry={() => void setup.refetch()}
            />
        );
    if (!setup.data) return null;
    if (compactConfirm)
        return (
            <Text size="sm">
                The Snowflake agent integration is set up. Turn on agent
                sign-in? People who haven't connected their agent are asked to
                connect.
            </Text>
        );
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
}) => (
    <>
        {!compactConfirm && (
            <Text size="sm" c="dimmed">
                Until this is verified, agents keep running as each user. After
                it's verified, people who haven't connected their agent are
                asked to connect.
            </Text>
        )}
        <Group justify="flex-end">
            <Button variant="default" disabled={saving} onClick={onCancel}>
                Cancel
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
                Turn on
            </Button>
        </Group>
    </>
);

type Props =
    | { mode: 'active' }
    | {
          mode: 'pending';
          saving: boolean;
          onCancel: () => void;
          onTurnOn: () => void;
      };

export const SnowflakeAgentSetup = (props: Props) => {
    const setup = useSnowflakeAgentSetup();
    const verify = useSnowflakeAgentVerify(props.mode === 'active');
    const [expanded, setExpanded] = useState(false);
    const [clientEdited, setClientEdited] = useState(false);
    const needsAttention = verify.isError || verify.data?.passed === false;
    const showSteps = props.mode === 'pending' || expanded || needsAttention;
    const compactConfirm =
        props.mode === 'pending' &&
        !clientEdited &&
        setup.data?.configured === true;
    const verified = !verify.isError && verify.data?.passed === true;
    return (
        <Stack gap="sm">
            {props.mode === 'active' && (
                <SnowflakeIntegrationStatus
                    verified={verified}
                    needsAttention={needsAttention}
                    verification={verify.data ?? null}
                    expanded={expanded}
                    onToggle={() => setExpanded((value) => !value)}
                />
            )}
            {showSteps && (
                <Paper withBorder p="md" radius="md">
                    <Stack gap="md">
                        <Stack gap="xs">
                            <Group justify="space-between" wrap="nowrap">
                                <Title order={5}>
                                    {compactConfirm
                                        ? 'Turn on agent sign-in'
                                        : 'Set up the Snowflake agent integration'}
                                </Title>
                                {props.mode === 'pending' && (
                                    <Badge color="orange" variant="light">
                                        Not active yet
                                    </Badge>
                                )}
                            </Group>
                            {!compactConfirm && (
                                <Text size="sm" c="dimmed">
                                    Run this once in Snowflake as ACCOUNTADMIN.
                                    It lets people sign their agent in as
                                    themselves.
                                </Text>
                            )}
                        </Stack>
                        <SnowflakeSetupContent
                            setup={setup}
                            verify={verify}
                            compactConfirm={compactConfirm}
                            onClientSave={() => setClientEdited(true)}
                        />
                        {verify.isError && (
                            <Text size="sm" c="red" role="alert">
                                Could not verify the Snowflake agent
                                integration. Try again.
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
            )}
        </Stack>
    );
};

import {
    AI_IDENTITY_PROVISIONER_WORST_CASE,
    AI_IDENTITY_SHOW_USERS_NOTICE,
    AiIdentityCreationMode,
    AiIdentityProvisionerStatus,
    DEFAULT_AI_IDENTITY_PROVISIONER_USER,
    DEFAULT_AI_IDENTITY_PROVISIONER_ROLE,
    type AiIdentityProvisioningSettings,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useState, type FC } from 'react';
import Callout from '../../components/common/Callout';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import MantineModal from '../../components/common/MantineModal';
import { RelativeTime } from './AiIdentityEventDisplay';
import { AiIdentityProvisioningReview } from './AiIdentityProvisioningReview';
import { AiIdentityRoleDefinitions } from './AiIdentityRoleDefinitions';
import { AiIdentityRoleMappings } from './AiIdentityRoleMappings';
import { aiIdentityProvisioningApi } from './api';
import { provisionerStatusLabels } from './provisioning';
import { useProvisioningChange } from './useProvisioning';

const CreateProvisioner: FC<{ settings: AiIdentityProvisioningSettings }> = ({
    settings,
}) => {
    const uuid = settings.aiIdentityAccountUuid;
    const change = useProvisioningChange(uuid);
    const [userName, setUserName] = useState(
        DEFAULT_AI_IDENTITY_PROVISIONER_USER,
    );
    const [roleName, setRoleName] = useState(
        DEFAULT_AI_IDENTITY_PROVISIONER_ROLE,
    );
    const [confirmStartAgain, setConfirmStartAgain] = useState(false);
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>2. Create the provisioner</Title>
                {change.error && (
                    <Callout variant="danger">
                        {change.error.error.message}
                    </Callout>
                )}
                {settings.aiRoles.length === 0 && (
                    <Text fz="sm" c="dimmed">
                        Define and save an AI role first.
                    </Text>
                )}
                <TextInput
                    label="Provisioner user name"
                    value={settings.provisioner?.userName ?? userName}
                    disabled={!!settings.provisioner}
                    onChange={(event) => setUserName(event.currentTarget.value)}
                />
                <TextInput
                    label="Provisioner role name"
                    value={settings.provisioner?.roleName ?? roleName}
                    disabled={!!settings.provisioner}
                    onChange={(event) => setRoleName(event.currentTarget.value)}
                />
                <Button
                    variant="default"
                    loading={change.isLoading}
                    disabled={
                        !!settings.provisioner ||
                        settings.aiRoles.length === 0 ||
                        !userName.trim() ||
                        !roleName.trim()
                    }
                    onClick={() =>
                        change.mutate(() =>
                            aiIdentityProvisioningApi.create(uuid, {
                                userName,
                                roleName,
                            }),
                        )
                    }
                >
                    Create provisioner key
                </Button>
                {settings.provisioner && (
                    <Button
                        variant="subtle"
                        onClick={() => setConfirmStartAgain(true)}
                    >
                        Start again
                    </Button>
                )}
                {settings.cleanupSql && (
                    <details>
                        <summary>
                            <Text span fz="sm">
                                Remove the provisioner from Snowflake
                            </Text>
                        </summary>
                        <Stack gap="xs" mt="xs">
                            <Text fz="sm">
                                Run this as ACCOUNTADMIN to remove the
                                provisioner and the AI identities that it
                                created. The provisioner role owns these users,
                                so the script gives its role to ACCOUNTADMIN
                                first.
                            </Text>
                            <CodeBlock
                                code={settings.cleanupSql}
                                language="sql"
                            />
                        </Stack>
                    </details>
                )}
                <MantineModal
                    opened={confirmStartAgain}
                    onClose={() => setConfirmStartAgain(false)}
                    title="Start again?"
                    description="Delete the provisioner record and key? The Snowflake user and role stay in your account. To remove them, run the script under Remove the provisioner from Snowflake."
                    confirmLabel="Start again"
                    confirmLoading={change.isLoading}
                    onConfirm={() =>
                        change.mutate(
                            () =>
                                aiIdentityProvisioningApi.deleteProvisioner(
                                    uuid,
                                ),
                            {
                                onSuccess: () => setConfirmStartAgain(false),
                            },
                        )
                    }
                />
                {settings.setupSql && (
                    <>
                        <Text fz="sm">
                            Create the provisioner user and role, and grant
                            access to provision the mapped AI roles.
                        </Text>
                        <Text fz="sm">
                            Run this as a role that can create roles and users,
                            for example SECURITYADMIN, or ACCOUNTADMIN for the
                            future grants.
                        </Text>
                        <CodeBlock code={settings.setupSql} language="sql" />
                        <Button
                            component="a"
                            variant="default"
                            href={`data:application/sql;charset=utf-8,${encodeURIComponent(settings.setupSql)}`}
                            download="ai-identity-provisioner.sql"
                        >
                            Download .sql
                        </Button>
                    </>
                )}
            </Stack>
        </Paper>
    );
};

const CheckProvisioner: FC<{ settings: AiIdentityProvisioningSettings }> = ({
    settings,
}) => {
    const uuid = settings.aiIdentityAccountUuid;
    const change = useProvisioningChange(uuid);
    const [confirmTurnOff, setConfirmTurnOff] = useState(false);
    const status =
        settings.provisioner?.status ?? AiIdentityProvisionerStatus.NOT_SET_UP;
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>3. Check the provisioner</Title>
                {settings.mode === AiIdentityCreationMode.AUTOMATIC &&
                    (settings.effectiveMode ===
                    AiIdentityCreationMode.AUTOMATIC ? (
                        <Callout
                            variant="success"
                            title="Automatic creation is on"
                        >
                            Lightdash creates, updates and drops AI identities
                            when people join, leave or change groups.
                        </Callout>
                    ) : (
                        <Callout
                            variant="warning"
                            title="Automatic creation is paused"
                        >
                            {settings.fallbackReason ??
                                'Check the provisioner to resume.'}
                        </Callout>
                    ))}
                {change.error && (
                    <Callout variant="danger">
                        {change.error.error.message}
                    </Callout>
                )}
                {!settings.provisioner && (
                    <Text fz="sm" c="dimmed">
                        Create the provisioner first.
                    </Text>
                )}
                <Group>
                    <Badge
                        color={
                            status === AiIdentityProvisionerStatus.READY
                                ? 'green'
                                : status ===
                                        AiIdentityProvisionerStatus.FAILING ||
                                    status ===
                                        AiIdentityProvisionerStatus.REVOKED
                                  ? 'red'
                                  : 'gray'
                        }
                    >
                        {provisionerStatusLabels[status]}
                    </Badge>
                    <RelativeTime
                        value={settings.provisioner?.checkedAt ?? null}
                    />
                </Group>
                {settings.provisioner?.statusMessage && (
                    <Text fz="sm">{settings.provisioner.statusMessage}</Text>
                )}
                <Group>
                    <Button
                        variant="default"
                        disabled={!settings.provisioner}
                        loading={change.isLoading}
                        onClick={() =>
                            change.mutate(() =>
                                aiIdentityProvisioningApi.verify(uuid),
                            )
                        }
                    >
                        Check now
                    </Button>
                    {settings.mode !== AiIdentityCreationMode.AUTOMATIC && (
                        <Button
                            disabled={
                                status !== AiIdentityProvisionerStatus.READY
                            }
                            loading={change.isLoading}
                            onClick={() =>
                                change.mutate(() =>
                                    aiIdentityProvisioningApi.update(uuid, {
                                        mode: AiIdentityCreationMode.AUTOMATIC,
                                    }),
                                )
                            }
                        >
                            Enable automatic creation
                        </Button>
                    )}
                    {settings.mode === AiIdentityCreationMode.AUTOMATIC && (
                        <Button
                            variant="subtle"
                            loading={change.isLoading}
                            onClick={() => setConfirmTurnOff(true)}
                        >
                            Turn off
                        </Button>
                    )}
                </Group>
                <MantineModal
                    opened={confirmTurnOff}
                    onClose={() => setConfirmTurnOff(false)}
                    title="Turn off automatic creation?"
                    description="Lightdash stops creating and dropping AI identities. Existing AI identities and the provisioner stay in Snowflake."
                    confirmLabel="Turn off"
                    confirmLoading={change.isLoading}
                    onConfirm={() =>
                        change.mutate(
                            () =>
                                aiIdentityProvisioningApi.update(uuid, {
                                    mode: AiIdentityCreationMode.GUIDED,
                                }),
                            { onSuccess: () => setConfirmTurnOff(false) },
                        )
                    }
                />
            </Stack>
        </Paper>
    );
};

export const AiIdentityAutomaticSetup: FC<{
    settings: AiIdentityProvisioningSettings;
    onJob: (uuid: string) => void;
}> = ({ settings, onJob }) => {
    const [mappingsDirty, setMappingsDirty] = useState(false);
    const status =
        settings.provisioner?.status ?? AiIdentityProvisionerStatus.NOT_SET_UP;
    return (
        <Stack gap="lg">
            <Callout variant="neutral" hideIcon>
                <Stack gap="xs">
                    <Text fz="sm">{AI_IDENTITY_PROVISIONER_WORST_CASE}</Text>
                    <Text fz="sm">{AI_IDENTITY_SHOW_USERS_NOTICE}</Text>
                </Stack>
            </Callout>
            <AiIdentityRoleDefinitions settings={settings} />
            <CreateProvisioner settings={settings} />
            <CheckProvisioner settings={settings} />
            <fieldset
                disabled={status !== AiIdentityProvisionerStatus.READY}
                style={{ border: 0, padding: 0, margin: 0 }}
            >
                <AiIdentityRoleMappings
                    settings={settings}
                    hint={
                        status === AiIdentityProvisionerStatus.READY
                            ? null
                            : 'Check the provisioner first.'
                    }
                    onDirty={setMappingsDirty}
                />
            </fieldset>
            <fieldset
                disabled={
                    status !== AiIdentityProvisionerStatus.READY ||
                    settings.mappings.length === 0 ||
                    mappingsDirty
                }
                style={{ border: 0, padding: 0, margin: 0 }}
            >
                <AiIdentityProvisioningReview
                    settings={settings}
                    hint={
                        status !== AiIdentityProvisionerStatus.READY
                            ? 'Check the provisioner first.'
                            : settings.mappings.length === 0
                              ? 'Save at least one group mapping first.'
                              : null
                    }
                    mappingsDirty={mappingsDirty}
                    onJob={onJob}
                />
            </fieldset>
        </Stack>
    );
};

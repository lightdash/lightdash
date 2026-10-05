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
                    <Text fz="sm">Define and save an AI role first.</Text>
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
                <MantineModal
                    opened={confirmStartAgain}
                    onClose={() => setConfirmStartAgain(false)}
                    title="Start again?"
                    description="Delete the provisioner record and key? The Snowflake user and role stay in your account."
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
    const status =
        settings.provisioner?.status ?? AiIdentityProvisionerStatus.NOT_SET_UP;
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>3. Check the provisioner</Title>
                {change.error && (
                    <Callout variant="danger">
                        {change.error.error.message}
                    </Callout>
                )}
                {!settings.provisioner && (
                    <Text fz="sm">Create the provisioner first.</Text>
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
                            variant="default"
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
                </Group>
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
            {status !== AiIdentityProvisionerStatus.READY && (
                <Text fz="sm">
                    Verify the provisioner before mapping groups.
                </Text>
            )}
            <fieldset
                disabled={status !== AiIdentityProvisionerStatus.READY}
                style={{ border: 0, padding: 0, margin: 0 }}
            >
                <AiIdentityRoleMappings
                    settings={settings}
                    onDirty={setMappingsDirty}
                />
            </fieldset>
            {status !== AiIdentityProvisionerStatus.READY && (
                <Text fz="sm">
                    Verify the provisioner before reviewing the plan.
                </Text>
            )}
            {status === AiIdentityProvisionerStatus.READY &&
                settings.mappings.length === 0 && (
                    <Text fz="sm">
                        Save at least one group mapping before reviewing the
                        plan.
                    </Text>
                )}
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
                    mappingsDirty={mappingsDirty}
                    onJob={onJob}
                />
            </fieldset>
        </Stack>
    );
};

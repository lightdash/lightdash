import {
    AI_IDENTITY_PROVISIONER_WORST_CASE,
    AI_IDENTITY_SHOW_USERS_NOTICE,
    AI_IDENTITY_SYNC_MAX_AGE_MINUTES,
    AiIdentityCreationMode,
    assertUnreachable,
    getAiIdentitySetupCheckInterval,
    type AiIdentitySetupCheckItem,
    type AiIdentityProvisioner,
    AiIdentityProvisionerStatus,
    AiIdentitySyncStatus,
    AI_IDENTITY_SCHEMA_CHANGED_MESSAGE,
    type AiIdentityAiRoleExpansion,
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
import {
    IconCircleCheckFilled,
    IconCircleXFilled,
    IconClock,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import Callout from '../../components/common/Callout';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import { SchemaNames } from '../../components/common/SchemaRuleInput/SchemaRuleInput';
import { RelativeTime } from './AiIdentityEventDisplay';
import { AiIdentityExclusionChanges } from './AiIdentityExclusionChanges';
import { AiIdentityProvisioningReview } from './AiIdentityProvisioningReview';
import { AiIdentityRoleDefinitions } from './AiIdentityRoleDefinitions';
import { AiIdentityRoleMappings } from './AiIdentityRoleMappings';
import { AiIdentityUngrantedSchemas } from './AiIdentityUngrantedSchemas';
import { aiIdentityProvisioningApi } from './api';
import { provisionerStatusLabels } from './provisioning';
import { useProvisioningChange, useSetupCheck } from './useProvisioning';

const aiRoleExpansionSummary = (
    expansion: AiIdentityAiRoleExpansion,
): string => {
    if (!expansion.catalogLoaded)
        return `${expansion.roleName}: the schema catalog is not loaded yet, so the sync grants schemas after the catalog loads.`;
    return `${expansion.roleName}: ${expansion.allowed.length} ${expansion.allowed.length === 1 ? 'schema' : 'schemas'} allowed, ${expansion.excluded.length} excluded.`;
};

const checklistIcon = (status: AiIdentitySetupCheckItem['status']) => {
    switch (status) {
        case 'passed':
            return <MantineIcon icon={IconCircleCheckFilled} color="green.6" />;
        case 'failed':
            return <MantineIcon icon={IconCircleXFilled} color="red.6" />;
        case 'pending':
            return <MantineIcon icon={IconClock} color="dimmed" />;
        default:
            return assertUnreachable(status, 'Unknown setup check status');
    }
};

const AiIdentityGrantSyncStatus: FC<{
    sync: AiIdentityProvisioningSettings['automaticSync'];
}> = ({ sync }) => {
    const lastRunAge =
        sync.lastRunAt === null
            ? NaN
            : Date.now() - new Date(sync.lastRunAt).getTime();
    const syncSafe =
        sync.status === AiIdentitySyncStatus.OK &&
        lastRunAge >= 0 &&
        lastRunAge <= AI_IDENTITY_SYNC_MAX_AGE_MINUTES * 60_000;
    const runningWithinWindow =
        sync.status === AiIdentitySyncStatus.RUNNING &&
        lastRunAge >= 0 &&
        lastRunAge < AI_IDENTITY_SYNC_MAX_AGE_MINUTES * 60_000;
    const issues = [
        ...new Map(
            sync.issues.map((issue) => [JSON.stringify(issue), issue]),
        ).entries(),
    ];
    return (
        <>
            <Group>
                <Badge
                    color={
                        sync.status === AiIdentitySyncStatus.OK
                            ? 'green'
                            : 'yellow'
                    }
                >
                    {sync.status ?? 'No run'}
                </Badge>
                <RelativeTime value={sync.lastRunAt} />
            </Group>
            {!syncSafe && (
                <Callout variant="warning">
                    {runningWithinWindow
                        ? `Grant sync is running. ${sync.progress} schemas processed. AI queries resume after a successful scheduled run.`
                        : sync.unsafeReason === 'schema_changed'
                          ? AI_IDENTITY_SCHEMA_CHANGED_MESSAGE
                          : 'AI queries are paused. Check the latest Snowflake grant sync run.'}
                </Callout>
            )}
            {issues.length > 0 && (
                <Callout variant="warning" title="Grant sync warnings">
                    {issues.map(([key, issue]) => (
                        <Text key={key} fz="sm">
                            {issue.code}: {issue.message}
                            {issue.roleName ? ` (${issue.roleName})` : ''}
                            {issue.schema ? ` ${issue.schema}` : ''}
                        </Text>
                    ))}
                </Callout>
            )}
        </>
    );
};

const AiIdentityGrantSyncSetup: FC<{
    settings: AiIdentityProvisioningSettings;
}> = ({ settings }) => {
    const sync = settings.automaticSync;
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>Keep AI role grants in sync</Title>
                <Text fz="sm">
                    A Snowflake admin runs this script to set the managed roles
                    and databases. Ask them to run it again when the managed
                    scope changes. Snowflake checks grants every 10 minutes.
                </Text>
                <Callout variant="neutral" title="Managed scope">
                    Set in Snowflake by your admin.
                    {sync.managedScope.length === 0
                        ? ' No roles or databases are in scope.'
                        : sync.managedScope.map((entry) => (
                              <Text
                                  key={entry.roleName + '.' + entry.database}
                                  fz="sm"
                              >
                                  {entry.roleName}: {entry.database}
                              </Text>
                          ))}
                </Callout>
                <AiIdentityGrantSyncStatus sync={sync} />
            </Stack>
        </Paper>
    );
};

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
    const state = settings.provisioner?.setupCheck;
    const interval = state?.nextCheckAt
        ? getAiIdentitySetupCheckInterval(state.waitingSince)
        : false;
    const startWaiting = () =>
        change.mutate(() => aiIdentityProvisioningApi.startWaiting(uuid));
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>2. Setup script</Title>
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
                {settings.aiRoleExpansions.map((expansion) => (
                    <Stack key={expansion.roleName} gap="xs">
                        <Text size="sm">
                            {aiRoleExpansionSummary(expansion)}
                        </Text>
                        {expansion.catalogLoaded &&
                            expansion.excluded.length > 0 && (
                                <details>
                                    <summary>Show excluded schemas</summary>
                                    <SchemaNames
                                        schemas={expansion.excluded}
                                        limit={null}
                                    />
                                </details>
                            )}
                    </Stack>
                ))}
                {settings.setupSql && (
                    <>
                        <Text fz="sm">
                            Create the setup roles and user. The grant sync
                            applies access to allowed schemas.
                        </Text>
                        <Text fz="sm">Run this as ACCOUNTADMIN.</Text>
                        <CodeBlock
                            code={settings.setupSql}
                            language="sql"
                            onCopy={startWaiting}
                        />
                        <Button
                            component="a"
                            variant="default"
                            href={`data:application/sql;charset=utf-8,${encodeURIComponent(settings.setupSql)}`}
                            download="ai-identity-provisioner.sql"
                            onClick={startWaiting}
                        >
                            Download .sql
                        </Button>
                        {interval !== false && (
                            <Callout variant="info">
                                Waiting for the setup script. Run it in
                                Snowflake. Lightdash checks every{' '}
                                {interval === 10_000 ? '10' : '60'} seconds. You
                                can leave this page.
                            </Callout>
                        )}
                    </>
                )}
            </Stack>
        </Paper>
    );
};

const SetupCheckResults: FC<{ provisioner: AiIdentityProvisioner | null }> = ({
    provisioner,
}) => {
    const state = provisioner?.setupCheck;
    const status =
        provisioner?.status ?? AiIdentityProvisionerStatus.NOT_SET_UP;
    return (
        <>
            {state?.checks.map((check) => (
                <Group key={check.key} align="flex-start" wrap="nowrap">
                    {checklistIcon(check.status)}
                    <Stack gap={2}>
                        <Text size="sm">{check.label}</Text>
                        {check.detail && (
                            <Text
                                size="sm"
                                c={check.status === 'failed' ? 'red' : 'dimmed'}
                            >
                                {check.detail}
                            </Text>
                        )}
                    </Stack>
                </Group>
            ))}
            <Group>
                <Badge
                    color={
                        status === AiIdentityProvisionerStatus.READY
                            ? 'green'
                            : status === AiIdentityProvisionerStatus.FAILING ||
                                status === AiIdentityProvisionerStatus.REVOKED
                              ? 'red'
                              : 'gray'
                    }
                >
                    {provisionerStatusLabels[status]}
                </Badge>
                {state?.automatic &&
                status !== AiIdentityProvisionerStatus.WAITING_FOR_SETUP &&
                provisioner?.checkedAt ? (
                    <Text size="sm" c="dimmed">
                        Checked automatically
                    </Text>
                ) : (
                    <>
                        <RelativeTime value={provisioner?.checkedAt ?? null} />
                        {state?.checkedByName && (
                            <Text size="sm" c="dimmed">
                                Checked by {state.checkedByName}
                            </Text>
                        )}
                    </>
                )}
            </Group>
            {!state && provisioner?.statusMessage && (
                <Text fz="sm">{provisioner.statusMessage}</Text>
            )}
        </>
    );
};

const CheckProvisioner: FC<{ settings: AiIdentityProvisioningSettings }> = ({
    settings,
}) => {
    const uuid = settings.aiIdentityAccountUuid;
    const change = useProvisioningChange(uuid);
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>3. Check the setup</Title>
                <AiIdentityUngrantedSchemas
                    entries={settings.ungrantedSchemas}
                    issues={settings.automaticSync.issues}
                />
                {settings.mode === AiIdentityCreationMode.AUTOMATIC &&
                    settings.effectiveMode !==
                        AiIdentityCreationMode.AUTOMATIC && (
                        <Callout
                            variant="warning"
                            title="Automatic creation is paused"
                        >
                            {settings.fallbackReason ??
                                'Check the setup to resume.'}
                        </Callout>
                    )}
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
                <SetupCheckResults provisioner={settings.provisioner} />
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
                </Group>
            </Stack>
        </Paper>
    );
};

export const AiIdentityAutomaticSetup: FC<{
    settings: AiIdentityProvisioningSettings;
    onJob: (uuid: string) => void;
}> = ({ settings, onJob }) => {
    useSetupCheck(settings);
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
            <AiIdentityExclusionChanges
                accountUuid={settings.aiIdentityAccountUuid}
            />
            <CreateProvisioner settings={settings} />
            <AiIdentityGrantSyncSetup settings={settings} />
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
                id="review-and-run"
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

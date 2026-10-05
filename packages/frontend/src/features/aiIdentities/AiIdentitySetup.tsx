import {
    AiIdentityState,
    DEFAULT_AI_IDENTITY_ROLE_TEMPLATE,
    DEFAULT_AI_TWIN_NAME_TEMPLATE,
    resolveAiIdentityRole,
    type AiIdentity,
    type AiIdentityAccount,
    type AiIdentityFilter,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Group,
    Paper,
    Radio,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import Callout from '../../components/common/Callout';
import { useProjects } from '../../hooks/useProjects';
import { aiIdentityApi } from './api';
import { getIdentityPreview, getRoleMode, type RoleMode } from './setupPreview';

type Props = {
    account: AiIdentityAccount;
    onJob: (
        kind: 'test' | 'export',
        filter: AiIdentityFilter,
        format?: 'json' | 'sql' | 'csv',
        roleForTwin?: string | null,
    ) => Promise<void>;
};

const RoleControls: FC<{
    mode: RoleMode;
    role: string;
    roleError: string | null;
    onModeChange: (value: string) => void;
    onRoleChange: (value: string) => void;
}> = ({ mode, role, roleError, onModeChange, onRoleChange }) => (
    <>
        <Radio.Group
            label="Role grants in the script"
            value={mode}
            onChange={onModeChange}
        >
            <Stack gap="xs" mt="xs">
                <Radio value="template" label="Role per person (template)" />
                <Radio value="none" label="No roles in the script" />
                <Radio
                    value="shared"
                    label="One shared role (all AI identities get the same grants)"
                />
            </Stack>
        </Radio.Group>
        {mode === 'shared' && (
            <Callout variant="warning">
                Every AI identity with this role gets the same grants.
            </Callout>
        )}
        {mode !== 'none' && (
            <TextInput
                label={mode === 'template' ? 'Role template' : 'Shared role'}
                error={roleError}
                value={role}
                onChange={(event) => onRoleChange(event.currentTarget.value)}
            />
        )}
    </>
);

const IdentityPreview: FC<{
    samples: AiIdentity[];
    nameTemplate: string;
    roleTemplate: string | null;
    loading: boolean;
    error: boolean;
}> = ({ samples, nameTemplate, roleTemplate, loading, error }) => (
    <Stack gap="xs">
        <Text fw={500} fz="sm">
            Preview
        </Text>
        {loading && (
            <Text fz="sm" c="dimmed">
                Loading preview…
            </Text>
        )}
        {error && (
            <Text fz="sm" c="red">
                Could not load the preview.
            </Text>
        )}
        {!loading && !error && samples.length === 0 && (
            <Text fz="sm" c="dimmed">
                No identities to preview.
            </Text>
        )}
        {samples.map((identity) => {
            const preview = getIdentityPreview(
                identity,
                nameTemplate,
                roleTemplate,
            );
            return (
                <Group key={identity.aiIdentityUuid} justify="space-between">
                    <Text fz="sm">{identity.email}</Text>
                    <Text fz="sm">{preview.name}</Text>
                    <Text fz="sm">{preview.role}</Text>
                </Group>
            );
        })}
    </Stack>
);

export const AiIdentitySetup: FC<Props> = ({ account, onJob }) => {
    const [template, setTemplate] = useState(
        () => account.twinNameTemplate ?? DEFAULT_AI_TWIN_NAME_TEMPLATE,
    );
    const [roleMode, setRoleMode] = useState<RoleMode>(() =>
        getRoleMode(account.roleTemplate),
    );
    const [role, setRole] = useState(
        account.roleTemplate ?? DEFAULT_AI_IDENTITY_ROLE_TEMPLATE,
    );
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const queryClient = useQueryClient();
    const projectsQuery = useProjects();
    const filter: AiIdentityFilter = {
        aiIdentityAccountUuid: account.aiIdentityAccountUuid,
        states: [],
        reasons: [],
        projectUuid: null,
        search: null,
        staleOnly: false,
    };
    const sampleQuery = useQuery({
        queryKey: ['ai-identity-setup-sample', account.aiIdentityAccountUuid],
        queryFn: () => aiIdentityApi.preview(account.aiIdentityAccountUuid),
    });
    const roleTemplate = roleMode === 'none' ? null : role.trim();
    let roleError: string | null = null;
    if (roleTemplate !== null) {
        try {
            resolveAiIdentityRole(roleTemplate, 'LOGIN', 'IDENTITY');
        } catch {
            roleError =
                'Use letters, numbers, underscores, $ or a supported placeholder.';
        }
    }
    const save = async () => {
        setSaving(true);
        try {
            setError(null);
            setSaved(false);
            await aiIdentityApi.updateAccount(
                account.aiIdentityAccountUuid,
                template.trim(),
                roleTemplate,
            );
            await queryClient.invalidateQueries(['ai-identity-accounts']);
            setSaved(true);
        } catch {
            setError('Could not save the AI identity settings.');
        } finally {
            setSaving(false);
        }
    };
    const changeRoleMode = (value: string) => {
        const mode = value as RoleMode;
        setRoleMode(mode);
        if (mode === 'shared' && getRoleMode(role) !== 'shared')
            setRole('AI_ROLE');
        if (mode === 'template' && getRoleMode(role) !== 'template')
            setRole(DEFAULT_AI_IDENTITY_ROLE_TEMPLATE);
    };
    const pendingFilter = { ...filter, states: [AiIdentityState.PENDING] };

    return (
        <Stack gap="lg">
            <Paper p="md">
                <Stack gap="sm">
                    <Title order={5}>AI identity settings</Title>
                    <Text fz="sm" c="dimmed">
                        Use {'{snowflake_login}'} in each identity name. A role
                        can use {'{ai_identity_name}'} or {'{snowflake_login}'}.
                    </Text>
                    {error && <Callout variant="danger">{error}</Callout>}
                    {saved && (
                        <Callout variant="success">Settings saved.</Callout>
                    )}
                    <TextInput
                        label="Naming template"
                        value={template}
                        onChange={(event) =>
                            setTemplate(event.currentTarget.value)
                        }
                    />
                    <RoleControls
                        mode={roleMode}
                        role={role}
                        roleError={roleError}
                        onModeChange={changeRoleMode}
                        onRoleChange={setRole}
                    />
                    <IdentityPreview
                        samples={sampleQuery.data ?? []}
                        nameTemplate={template}
                        roleTemplate={roleTemplate}
                        loading={sampleQuery.isLoading}
                        error={sampleQuery.isError}
                    />
                    <Group justify="flex-end">
                        <Button
                            disabled={!!roleError || !template.trim() || saving}
                            loading={saving}
                            onClick={() => void save()}
                        >
                            Save settings
                        </Button>
                    </Group>
                </Stack>
            </Paper>
            <Paper p="md">
                <Stack gap="sm">
                    <Title order={5}>
                        Create pending identities in Snowflake
                    </Title>
                    <Text fz="sm" c="dimmed">
                        Export one SQL file for {account.counts.pending} pending
                        identities. The file contains public keys only; private
                        keys stay on the server.
                    </Text>
                    <Text fz="sm" c="dimmed">
                        Role setting:{' '}
                        {account.roleTemplate ?? 'No roles in the script'}
                    </Text>
                    <Group justify="space-between">
                        {projectsQuery.data?.[0] && (
                            <Anchor
                                href={`/generalSettings/projectManagement/${projectsQuery.data[0].projectUuid}/agentDataScope`}
                            >
                                Open the project guide
                            </Anchor>
                        )}
                        <Button
                            disabled={account.counts.pending === 0}
                            onClick={() =>
                                void onJob('export', pendingFilter, 'sql')
                            }
                        >
                            Export SQL for pending
                        </Button>
                    </Group>
                </Stack>
            </Paper>
        </Stack>
    );
};

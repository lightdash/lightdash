import {
    FeatureFlags,
    type AgentCapabilityPolicy,
    type AgentCapabilityPolicyOverview,
} from '@lightdash/common';
import {
    Alert,
    Button,
    Group,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import isEqual from 'lodash/isEqual';
import { useState } from 'react';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import MantineModal from '../../components/common/MantineModal';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';
import { useProjects } from '../../hooks/useProjects';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import {
    AgentAccessPickers,
    type AgentPickerOption,
} from './AgentAccessPickers';
import { AgentCapabilityMatrix } from './AgentCapabilityMatrix';
import { AgentPilotPresetModal } from './AgentPilotPresetModal';
import {
    useAgentCapabilityPolicy,
    useResetAgentCapabilityPolicy,
    useSaveAgentCapabilityCeiling,
} from './api';
import { EmptyAgentPilotConfirmModal } from './EmptyAgentPilotConfirmModal';

const formValues = (
    policy: AgentCapabilityPolicy,
    defaults: AgentCapabilityPolicyOverview['defaults'],
) => ({
    mode: policy.mode,
    version: policy.version,
    systemRoleMatrix:
        policy.mode === 'legacy' ? defaults : policy.systemRoleMatrix,
    allowedProjectUuids:
        policy.mode === 'legacy' ? null : policy.allowedProjectUuids,
    allowedUserUuids: policy.mode === 'legacy' ? null : policy.allowedUserUuids,
});

const useAgentPermissionDraft = (policy: AgentCapabilityPolicyOverview) => {
    type Values = ReturnType<typeof formValues>;
    const [draft, setDraft] = useState<{
        baseline: Values;
        values: Values;
    } | null>(null);
    const dirty = draft !== null && !isEqual(draft.values, draft.baseline);
    const latest = formValues(policy, policy.defaults);
    const baseline =
        draft && (dirty || draft.baseline.version > policy.version)
            ? draft.baseline
            : latest;
    const values = dirty ? draft.values : baseline;
    const conflict = dirty && policy.version > baseline.version;
    const change = (changes: Partial<Values>) =>
        setDraft({ baseline, values: { ...values, ...changes } });
    return {
        baseline,
        values,
        dirty,
        conflict,
        change,
        discard: () => setDraft(null),
        accept: (updated: AgentCapabilityPolicy) => {
            const saved = formValues(updated, policy.defaults);
            setDraft({ baseline: saved, values: saved });
        },
    };
};

const AgentPermissionLimits = ({
    values,
    starting,
    dirty,
    disabled,
    saving,
    projects,
    people,
    onChange,
    onDiscard,
    onPreset,
    onSave,
}: {
    values: ReturnType<typeof formValues>;
    starting: boolean;
    dirty: boolean;
    disabled: boolean;
    saving: boolean;
    projects: AgentPickerOption[];
    people: AgentPickerOption[];
    onChange: (changes: Partial<ReturnType<typeof formValues>>) => void;
    onDiscard: () => void;
    onPreset: () => void;
    onSave: () => void;
}) => (
    <>
        {starting && (
            <Text size="sm" c="dimmed">
                Not saved yet — these are the starting limits.
            </Text>
        )}
        <Text size="sm" c="dimmed">
            Limits can reduce what agents do. They do not give a person more
            access than their roles allow.
        </Text>
        <AgentCapabilityMatrix
            matrix={values.systemRoleMatrix}
            onChange={(systemRoleMatrix) => onChange({ systemRoleMatrix })}
            disabled={disabled}
        />
        <AgentAccessPickers
            selection={values}
            projects={projects}
            people={people}
            onChange={onChange}
            disabled={disabled}
        />
        <Group justify="space-between">
            <Button variant="default" disabled={disabled} onClick={onPreset}>
                Apply restricted pilot preset
            </Button>
            <Group gap="sm">
                {dirty && (
                    <>
                        <Text size="sm" c="dimmed">
                            Unsaved changes
                        </Text>
                        <Button
                            variant="subtle"
                            disabled={saving}
                            onClick={onDiscard}
                        >
                            Discard changes
                        </Button>
                    </>
                )}
                <Button
                    loading={saving}
                    disabled={disabled || !dirty}
                    onClick={onSave}
                >
                    Save
                </Button>
            </Group>
        </Group>
    </>
);

const AgentPermissionsForm = ({
    policy,
    projects,
    people,
}: {
    policy: AgentCapabilityPolicyOverview;
    projects: AgentPickerOption[];
    people: AgentPickerOption[];
}) => {
    const {
        baseline,
        values,
        dirty,
        conflict,
        change,
        accept,
        discard: discardDraft,
    } = useAgentPermissionDraft(policy);
    const limitsOn = values.mode === 'managed';
    const starting = limitsOn && baseline.mode === 'legacy';
    const [modal, setModal] = useState<'empty' | 'reset' | 'preset' | null>(
        null,
    );
    const onSaved = (updated: AgentCapabilityPolicy) => {
        accept(updated);
        setModal(null);
    };
    const save = useSaveAgentCapabilityCeiling(onSaved);
    const reset = useResetAgentCapabilityPolicy(onSaved);
    const saving = save.isLoading || reset.isLoading;
    const editingDisabled = saving || conflict;
    const discard = () => {
        discardDraft();
        setModal(null);
    };
    const submit = () => {
        if (editingDisabled) return;
        save.mutate({
            version: values.version,
            systemRoleMatrix: values.systemRoleMatrix,
            allowedProjectUuids: values.allowedProjectUuids,
            allowedUserUuids: values.allowedUserUuids,
        });
    };
    return (
        <SettingsCard>
            <Stack gap="lg">
                <Title order={5}>Permissions</Title>
                {conflict && (
                    <Alert color="yellow" title="Agent permissions changed">
                        <Stack gap="sm">
                            <Text size="sm">
                                Someone changed the saved permissions. Reload
                                the latest permissions before saving. This will
                                discard your unsaved changes.
                            </Text>
                            <Button
                                variant="default"
                                disabled={saving}
                                onClick={discard}
                            >
                                Reload latest
                            </Button>
                        </Stack>
                    </Alert>
                )}
                <Switch
                    label="Limit what agents can do"
                    checked={limitsOn}
                    disabled={editingDisabled}
                    onChange={(event) => {
                        if (event.currentTarget.checked)
                            change({ mode: 'managed' });
                        else if (baseline.mode === 'managed') setModal('reset');
                        else discard();
                    }}
                />
                {!limitsOn && (
                    <Text size="sm">
                        Agents follow each person's permissions.
                    </Text>
                )}
                {limitsOn && (
                    <AgentPermissionLimits
                        values={values}
                        starting={starting}
                        dirty={dirty}
                        disabled={editingDisabled}
                        saving={saving}
                        projects={projects}
                        people={people}
                        onChange={change}
                        onDiscard={discard}
                        onPreset={() => setModal('preset')}
                        onSave={() => {
                            if (values.allowedUserUuids?.length === 0)
                                setModal('empty');
                            else submit();
                        }}
                    />
                )}
                <Text size="sm" c="dimmed">
                    Personal access tokens are not limited. An agent that uses a
                    person's personal access token has that person's access.
                </Text>
            </Stack>
            {!conflict && modal === 'empty' && (
                <EmptyAgentPilotConfirmModal
                    saving={saving}
                    onCancel={() => {
                        change({ allowedUserUuids: baseline.allowedUserUuids });
                        setModal(null);
                    }}
                    onConfirm={submit}
                />
            )}
            {!conflict && modal === 'reset' && (
                <MantineModal
                    opened
                    role="alertdialog"
                    title="Turn off limits?"
                    description="Agents will follow each person's permissions again. Project and pilot user limits will no longer apply. Any unsaved changes will be discarded."
                    onClose={() => {
                        if (!saving) setModal(null);
                    }}
                    confirmLabel="Turn off limits"
                    confirmLoading={reset.isLoading}
                    confirmDisabled={saving}
                    cancelDisabled={saving}
                    onConfirm={() => {
                        if (!saving) reset.mutate({ version: values.version });
                    }}
                />
            )}
            {!conflict && modal === 'preset' && (
                <AgentPilotPresetModal
                    current={values.systemRoleMatrix}
                    preset={policy.pilotPreset.systemRoleMatrix}
                    selection={values}
                    projects={projects}
                    people={people}
                    onClose={() => setModal(null)}
                    onSaved={onSaved}
                />
            )}
        </SettingsCard>
    );
};

const AgentPermissionsContent = () => {
    const policy = useAgentCapabilityPolicy();
    const projects = useProjects();
    const people = useOrganizationUsers();
    if (!policy.data || !projects.data || !people.data) {
        if (policy.isError || projects.isError || people.isError)
            return (
                <InlineErrorState
                    message="Could not load agent permissions."
                    onRetry={() => {
                        void policy.refetch();
                        void projects.refetch();
                        void people.refetch();
                    }}
                />
            );
        return <EmptyStateLoader />;
    }
    const projectOptions = projects.data.map((project) => ({
        value: project.projectUuid,
        label: project.name,
    }));
    const peopleOptions = people.data.map((person) => ({
        value: person.userUuid,
        label: `${[person.firstName, person.lastName].filter(Boolean).join(' ')} (${person.email})`,
    }));
    return (
        <AgentPermissionsForm
            policy={policy.data}
            projects={projectOptions}
            people={peopleOptions}
        />
    );
};

export const AgentPermissionsSection = () => {
    const { user } = useApp();
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    if (!flag?.enabled || !user.data?.ability.can('manage', 'Organization'))
        return null;
    return <AgentPermissionsContent key={user.data.organizationUuid} />;
};

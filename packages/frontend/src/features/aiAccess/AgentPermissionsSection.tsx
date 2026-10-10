import {
    FeatureFlags,
    type AgentCapabilityPolicy,
    type AgentCapabilityPolicyOverview,
} from '@lightdash/common';
import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useRef, useState } from 'react';
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
    allowedProjectUuids: policy.allowedProjectUuids,
    allowedUserUuids: policy.allowedUserUuids,
});

const AgentPermissionsForm = ({
    policy,
    projects,
    people,
}: {
    policy: AgentCapabilityPolicyOverview;
    projects: AgentPickerOption[];
    people: AgentPickerOption[];
}) => {
    const form = useForm({
        initialValues: formValues(policy, policy.defaults),
    });
    const save = useSaveAgentCapabilityCeiling();
    const reset = useResetAgentCapabilityPolicy();
    const [modal, setModal] = useState<'empty' | 'reset' | 'preset' | null>(
        null,
    );
    const matrixRef = useRef<HTMLDivElement>(null);
    const saving = save.isLoading || reset.isLoading;
    const onSaved = (updated: AgentCapabilityPolicy) => {
        const values = formValues(updated, policy.defaults);
        form.setValues(values);
        form.resetDirty(values);
        form.setInitialValues(values);
        setModal(null);
    };
    const submit = () => {
        if (saving) return;
        save.mutate(
            {
                systemRoleMatrix: form.values.systemRoleMatrix,
                allowedProjectUuids: form.values.allowedProjectUuids,
                allowedUserUuids: form.values.allowedUserUuids,
            },
            { onSuccess: onSaved },
        );
    };
    return (
        <SettingsCard>
            <Stack gap="lg">
                <Title order={5}>Agent permissions</Title>
                <Stack gap="xs">
                    <Group justify="space-between">
                        <Text size="sm">
                            {form.values.mode === 'legacy'
                                ? "Agents follow each person's permissions."
                                : 'Agent limits are on.'}
                        </Text>
                        {form.values.mode === 'legacy' ? (
                            <Button
                                disabled={saving}
                                onClick={() =>
                                    matrixRef.current?.scrollIntoView({
                                        block: 'center',
                                    })
                                }
                            >
                                Set limits
                            </Button>
                        ) : (
                            <Button
                                variant="default"
                                disabled={saving}
                                onClick={() => setModal('reset')}
                            >
                                Turn off limits
                            </Button>
                        )}
                    </Group>
                    {form.values.mode === 'managed' && (
                        <Text size="xs" c="dimmed">
                            Version {form.values.version}
                        </Text>
                    )}
                    {form.values.mode === 'legacy' && (
                        <Text size="sm" c="dimmed">
                            Not saved yet — these are the starting limits
                        </Text>
                    )}
                    <Text size="sm" c="dimmed">
                        Limits can reduce what agents do. They do not give a
                        person more access than their roles allow.
                    </Text>
                </Stack>
                <Stack ref={matrixRef} gap="xs">
                    <AgentCapabilityMatrix
                        matrix={form.values.systemRoleMatrix}
                        onChange={(value) =>
                            form.setFieldValue('systemRoleMatrix', value)
                        }
                        disabled={saving}
                    />
                </Stack>
                <AgentAccessPickers
                    selection={form.values}
                    projects={projects}
                    people={people}
                    onChange={(selection) => {
                        form.setFieldValue(
                            'allowedProjectUuids',
                            selection.allowedProjectUuids,
                        );
                        form.setFieldValue(
                            'allowedUserUuids',
                            selection.allowedUserUuids,
                        );
                    }}
                    disabled={saving}
                />
                <Text size="sm" c="dimmed">
                    Personal access tokens are not limited. An AI that uses a
                    person's token has that person's access.
                </Text>
                <Group justify="space-between">
                    <Button
                        variant="default"
                        disabled={saving}
                        onClick={() => setModal('preset')}
                    >
                        Apply restricted pilot preset
                    </Button>
                    <Group gap="sm">
                        {form.isDirty() && (
                            <>
                                <Text size="sm" c="dimmed">
                                    Unsaved changes
                                </Text>
                                <Button
                                    variant="subtle"
                                    disabled={saving}
                                    onClick={() => form.reset()}
                                >
                                    Discard changes
                                </Button>
                            </>
                        )}
                        <Button
                            variant={
                                form.values.mode === 'legacy'
                                    ? 'default'
                                    : 'filled'
                            }
                            loading={save.isLoading}
                            disabled={
                                saving ||
                                (form.values.mode === 'managed' &&
                                    !form.isDirty())
                            }
                            onClick={() => {
                                if (form.values.allowedUserUuids?.length === 0)
                                    setModal('empty');
                                else submit();
                            }}
                        >
                            Save limits
                        </Button>
                    </Group>
                </Group>
            </Stack>
            {modal === 'empty' && (
                <EmptyAgentPilotConfirmModal
                    saving={saving}
                    onCancel={() => {
                        form.setFieldValue(
                            'allowedUserUuids',
                            form.getInitialValues().allowedUserUuids,
                        );
                        setModal(null);
                    }}
                    onConfirm={submit}
                />
            )}
            {modal === 'reset' && (
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
                        if (!saving)
                            reset.mutate(undefined, { onSuccess: onSaved });
                    }}
                />
            )}
            {modal === 'preset' && (
                <AgentPilotPresetModal
                    current={form.values.systemRoleMatrix}
                    preset={policy.pilotPreset.systemRoleMatrix}
                    selection={form.values}
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

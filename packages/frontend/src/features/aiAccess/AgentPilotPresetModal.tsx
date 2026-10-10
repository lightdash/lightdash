import {
    OrganizationMemberRoleLabels,
    type AgentCapabilityPolicy,
    type AgentPilotSelection,
    type AgentSystemRoleMatrix,
    type OrganizationMemberRole,
} from '@lightdash/common';
import { MultiSelect, Stack, Table, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import MantineModal from '../../components/common/MantineModal';
import { type AgentPickerOption } from './AgentAccessPickers';
import { agentCapabilityLabels } from './agentCapabilityLabels';
import { useApplyAgentPilotPreset } from './api';
import { EmptyAgentPilotConfirmModal } from './EmptyAgentPilotConfirmModal';

export const AgentPilotPresetModal = ({
    current,
    preset,
    selection,
    projects,
    people,
    onClose,
    onSaved,
}: {
    current: AgentSystemRoleMatrix;
    preset: AgentSystemRoleMatrix;
    selection: AgentPilotSelection;
    projects: AgentPickerOption[];
    people: AgentPickerOption[];
    onClose: () => void;
    onSaved: (policy: AgentCapabilityPolicy) => void;
}) => {
    const form = useForm({
        initialValues: {
            allowedProjectUuids: selection.allowedProjectUuids ?? [],
            allowedUserUuids: selection.allowedUserUuids ?? [],
        },
    });
    const apply = useApplyAgentPilotPreset();
    const [confirmEmpty, setConfirmEmpty] = useState(false);
    const submit = () => {
        if (!apply.isLoading) apply.mutate(form.values, { onSuccess: onSaved });
    };
    return (
        <>
            <MantineModal
                opened
                title="Apply restricted pilot preset"
                onClose={() => {
                    if (!apply.isLoading) onClose();
                }}
                confirmLabel="Apply"
                confirmLoading={apply.isLoading}
                confirmDisabled={
                    apply.isLoading ||
                    form.values.allowedProjectUuids.length === 0
                }
                cancelDisabled={apply.isLoading}
                onConfirm={() => {
                    if (form.values.allowedUserUuids.length === 0)
                        setConfirmEmpty(true);
                    else submit();
                }}
            >
                <Stack gap="md">
                    <MultiSelect
                        label="Pilot projects"
                        data={projects}
                        searchable
                        disabled={apply.isLoading}
                        {...form.getInputProps('allowedProjectUuids')}
                    />
                    <MultiSelect
                        label="Pilot people"
                        data={people}
                        searchable
                        disabled={apply.isLoading}
                        {...form.getInputProps('allowedUserUuids')}
                    />
                    <Text size="sm">
                        Only the selected projects and people will be allowed.
                        People still need access through their roles. Custom
                        roles keep their existing scopes.
                    </Text>
                    <Text size="sm">
                        These changes replace the current system role limits and
                        any unsaved edits.
                    </Text>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Role</Table.Th>
                                <Table.Th>Turn on</Table.Th>
                                <Table.Th>Turn off</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {(
                                Object.keys(current) as OrganizationMemberRole[]
                            ).map((role) => (
                                <Table.Tr key={role}>
                                    <Table.Th scope="row">
                                        {OrganizationMemberRoleLabels[role]}
                                    </Table.Th>
                                    <Table.Td>
                                        {preset[role]
                                            .filter(
                                                (capability) =>
                                                    !current[role].includes(
                                                        capability,
                                                    ),
                                            )
                                            .map(
                                                (capability) =>
                                                    agentCapabilityLabels[
                                                        capability
                                                    ].label,
                                            )
                                            .join(', ') || 'No changes'}
                                    </Table.Td>
                                    <Table.Td>
                                        {current[role]
                                            .filter(
                                                (capability) =>
                                                    !preset[role].includes(
                                                        capability,
                                                    ),
                                            )
                                            .map(
                                                (capability) =>
                                                    agentCapabilityLabels[
                                                        capability
                                                    ].label,
                                            )
                                            .join(', ') || 'No changes'}
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Stack>
            </MantineModal>
            {confirmEmpty && (
                <EmptyAgentPilotConfirmModal
                    saving={apply.isLoading}
                    onCancel={() => {
                        form.setFieldValue(
                            'allowedUserUuids',
                            selection.allowedUserUuids ?? [],
                        );
                        setConfirmEmpty(false);
                    }}
                    onConfirm={submit}
                />
            )}
        </>
    );
};

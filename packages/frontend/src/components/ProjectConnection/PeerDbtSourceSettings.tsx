import {
    validateDbtProjectName,
    validateProjectDbtSourceName,
    type DbtSourceBindings,
    type PeerDbtSourceSettings,
    type PeerDbtSourceSummary,
    type PeerMembershipRole,
    type PeerRefreshPolicy,
} from '@lightdash/common';
import { Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import {
    useAddSharedDbtSource,
    useSharedDbtSources,
    useShareDbtRepository,
    useUpdatePeerDbtSource,
} from '../../hooks/usePeerDbtSources';
import Callout from '../common/Callout';
import MantineModal from '../common/MantineModal';

const membershipRoles = [
    { value: 'publish', label: 'Publish' },
    { value: 'dependency_only', label: 'Dependency only' },
] satisfies { value: PeerMembershipRole; label: string }[];

const refreshPolicies = [
    { value: 'git_refresh', label: 'Git refresh' },
    { value: 'ci_managed', label: 'CI managed' },
] satisfies { value: PeerRefreshPolicy; label: string }[];

export const PeerDbtSourceMetadata: FC<{ peer: PeerDbtSourceSettings }> = ({
    peer,
}) => (
    <Stack gap={2}>
        <Text size="xs" c="dimmed">
            dbt project:{' '}
            {peer.dbtProjectName ?? peer.dbtProjectNameConflict ?? 'Unknown'} ·{' '}
            {
                membershipRoles.find(
                    (role) => role.value === peer.membershipRole,
                )?.label
            }{' '}
            ·{' '}
            {
                refreshPolicies.find(
                    (policy) => policy.value === peer.refreshPolicy,
                )?.label
            }
        </Text>
        {peer.dbtProjectNameConflict && (
            <Text size="xs" c="red" role="alert">
                Two sources provide dbt project {peer.dbtProjectNameConflict} on
                the same connection; rename or rebind one.
            </Text>
        )}
    </Stack>
);

export const PeerDbtSourceSettingsModal: FC<{
    projectUuid: string;
    source: PeerDbtSourceSummary;
    canManage: boolean;
    onClose: () => void;
}> = ({ projectUuid, source, canManage, onClose }) => {
    const update = useUpdatePeerDbtSource(projectUuid);
    const share = useShareDbtRepository(projectUuid);
    const { peer } = source;
    const form = useForm<{
        dbtProjectName: string;
        membershipRole: PeerMembershipRole;
        refreshPolicy: PeerRefreshPolicy;
    }>({
        initialValues: {
            dbtProjectName: peer.dbtProjectName ?? '',
            membershipRole: peer.membershipRole,
            refreshPolicy: peer.refreshPolicy,
        },
        validate: {
            dbtProjectName: (value) =>
                value.trim() ? validateDbtProjectName(value) : null,
        },
    });
    const isSaving = update.isLoading || share.isLoading;
    const repository = peer.repository;
    const canShare =
        canManage && repository?.createdByProjectUuid === projectUuid;

    return (
        <MantineModal
            opened
            title={`dbt settings for ${source.name}`}
            onClose={onClose}
            confirmLabel="Save changes"
            onConfirm={
                canManage
                    ? () => {
                          if (form.validate().hasErrors) return;
                          update.mutate(
                              {
                                  sourceUuid: source.projectDbtSourceUuid,
                                  data: {
                                      dbtProjectName:
                                          form.values.dbtProjectName.trim() ||
                                          null,
                                      membershipRole:
                                          form.values.membershipRole,
                                      refreshPolicy: form.values.refreshPolicy,
                                  },
                              },
                              { onSuccess: onClose },
                          );
                      }
                    : undefined
            }
            confirmLoading={update.isLoading}
            confirmDisabled={isSaving}
            cancelDisabled={isSaving}
        >
            <Stack gap="md">
                <TextInput
                    label="dbt project name"
                    description="The project name declared in dbt_project.yml. Leave blank to clear it."
                    disabled={!canManage || isSaving}
                    {...form.getInputProps('dbtProjectName')}
                />
                <Select
                    label="Membership role"
                    data={membershipRoles}
                    allowDeselect={false}
                    disabled={!canManage || isSaving}
                    {...form.getInputProps('membershipRole')}
                />
                <Select
                    label="Refresh policy"
                    data={refreshPolicies}
                    allowDeselect={false}
                    disabled={!canManage || isSaving}
                    {...form.getInputProps('refreshPolicy')}
                />
                <PeerDbtSourceMetadata peer={peer} />
                {canShare && repository && (
                    <Switch
                        label="Share this repository with other projects"
                        checked={repository.isShared}
                        disabled={isSaving}
                        onChange={(event) =>
                            share.mutate({
                                repositoryUuid: repository.dbtRepositoryUuid,
                                isShared: event.currentTarget.checked,
                            })
                        }
                    />
                )}
                {(update.error || share.error) && (
                    <Callout variant="danger" role="alert">
                        {(update.error ?? share.error)?.error.message}
                    </Callout>
                )}
            </Stack>
        </MantineModal>
    );
};

export const AddSharedDbtSourceModal: FC<{
    projectUuid: string;
    bindings: DbtSourceBindings | undefined;
    onClose: () => void;
}> = ({ projectUuid, bindings, onClose }) => {
    const shared = useSharedDbtSources(projectUuid, true);
    const add = useAddSharedDbtSource(projectUuid);
    const form = useForm<{
        dbtRepositoryUuid: string;
        name: string;
        warehouseConnectionUuid: string | null;
        membershipRole: PeerMembershipRole;
        refreshPolicy: PeerRefreshPolicy;
    }>({
        initialValues: {
            dbtRepositoryUuid: '',
            name: '',
            warehouseConnectionUuid: null,
            membershipRole: 'publish',
            refreshPolicy: 'git_refresh',
        },
        validate: {
            dbtRepositoryUuid: (value) =>
                value ? null : 'Select a shared repository',
            name: (value) => validateProjectDbtSourceName(value.trim()),
        },
    });
    const original = bindings?.connections.find((item) => item.isOriginal);

    return (
        <MantineModal
            opened
            title="Add a shared dbt source"
            onClose={onClose}
            confirmLabel="Add source"
            confirmLoading={add.isLoading}
            confirmDisabled={shared.isInitialLoading || shared.isError}
            cancelDisabled={add.isLoading}
            onConfirm={() => {
                if (form.validate().hasErrors) return;
                add.mutate(
                    { ...form.values, name: form.values.name.trim() },
                    { onSuccess: onClose },
                );
            }}
        >
            <Stack gap="md">
                <Select
                    label="Shared repository"
                    placeholder={
                        shared.isInitialLoading
                            ? 'Loading repositories'
                            : 'Select a repository'
                    }
                    data={(shared.data ?? []).map((repository) => ({
                        value: repository.dbtRepositoryUuid,
                        label: `${repository.host}/${repository.owner}/${repository.name}`,
                    }))}
                    searchable
                    allowDeselect={false}
                    disabled={shared.isInitialLoading || add.isLoading}
                    nothingFoundMessage="No shared repositories available"
                    {...form.getInputProps('dbtRepositoryUuid')}
                />
                <TextInput
                    label="Name"
                    required
                    disabled={add.isLoading}
                    {...form.getInputProps('name')}
                />
                {bindings && (
                    <Select
                        label="Connection"
                        data={bindings.connections.map((connection) => ({
                            value: connection.warehouseConnectionUuid,
                            label: connection.name,
                        }))}
                        value={
                            form.values.warehouseConnectionUuid ??
                            original?.warehouseConnectionUuid ??
                            null
                        }
                        onChange={(value) =>
                            form.setFieldValue(
                                'warehouseConnectionUuid',
                                value === original?.warehouseConnectionUuid
                                    ? null
                                    : value,
                            )
                        }
                        allowDeselect={false}
                        disabled={add.isLoading}
                    />
                )}
                <Select
                    label="Membership role"
                    data={membershipRoles}
                    allowDeselect={false}
                    disabled={add.isLoading}
                    {...form.getInputProps('membershipRole')}
                />
                <Select
                    label="Refresh policy"
                    data={refreshPolicies}
                    allowDeselect={false}
                    disabled={add.isLoading}
                    {...form.getInputProps('refreshPolicy')}
                />
                {(shared.error || add.error) && (
                    <Callout variant="danger" role="alert">
                        {(shared.error ?? add.error)?.error.message}
                    </Callout>
                )}
            </Stack>
        </MantineModal>
    );
};

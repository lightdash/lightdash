import { assertUnreachable, type McpProjectAccess } from '@lightdash/common';
import {
    MultiSelect,
    SegmentedControl,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useState } from 'react';
import Callout from '../../../../../../components/common/Callout';
import InlineErrorState from '../../../../../../components/common/InlineErrorState';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import { useProjects } from '../../../../../../hooks/useProjects';
import {
    useAiOrganizationAdminSettings,
    useUpdateAiOrganizationSettings,
} from '../../../hooks/useAiOrganizationSettings';

export const McpProjectAccessSettingsCard = () => {
    const { data: settings } = useAiOrganizationAdminSettings();
    const [selectionDraftFor, setSelectionDraftFor] =
        useState<typeof settings>();
    const policy = settings?.mcpProjectAccess;
    const isSelectionDraft =
        settings !== undefined &&
        selectionDraftFor === settings &&
        policy?.mode === 'all';
    const { mutate: updateSettings, isLoading: isUpdatingSettings } =
        useUpdateAiOrganizationSettings();
    const {
        data: projects = [],
        isInitialLoading: isProjectsLoading,
        isError: isProjectsError,
        refetch: refetchProjects,
    } = useProjects({
        enabled: isSelectionDraft || policy?.mode === 'selected',
    });

    if (!policy) return null;

    let selectedProjectUuids: string[] | undefined;
    switch (policy.mode) {
        case 'all':
            selectedProjectUuids = isSelectionDraft ? [] : undefined;
            break;
        case 'selected':
            selectedProjectUuids = policy.projectUuids;
            break;
        default:
            return assertUnreachable(policy, 'Unknown MCP project access mode');
    }

    const disabled = isUpdatingSettings || settings.mcpEnabled === false;

    return (
        <SettingsCard>
            <Stack gap="sm">
                <Title order={5}>Project access</Title>
                <Text c="dimmed" fz="xs">
                    Choose which projects MCP clients can access. Users keep
                    their normal project access in the app. With only selected
                    projects, new projects stay unavailable to MCP clients until
                    added here.
                </Text>
                <SegmentedControl<McpProjectAccess['mode']>
                    aria-label="MCP project access"
                    value={isSelectionDraft ? 'selected' : policy.mode}
                    data={[
                        { value: 'all', label: 'All projects' },
                        { value: 'selected', label: 'Only selected projects' },
                    ]}
                    disabled={disabled}
                    onChange={(mode) => {
                        switch (mode) {
                            case 'all':
                                setSelectionDraftFor(undefined);
                                if (!isSelectionDraft) {
                                    updateSettings({
                                        mcpProjectAccess: { mode },
                                    });
                                }
                                break;
                            case 'selected':
                                setSelectionDraftFor(settings);
                                break;
                            default:
                                assertUnreachable(
                                    mode,
                                    'Unknown MCP project access mode',
                                );
                        }
                    }}
                />
                {selectedProjectUuids !== undefined && (
                    <>
                        <MultiSelect
                            label="Allowed projects"
                            placeholder={
                                isProjectsLoading
                                    ? 'Loading projects'
                                    : 'Select projects'
                            }
                            data={projects.map((project) => ({
                                value: project.projectUuid,
                                label: project.name,
                            }))}
                            value={selectedProjectUuids}
                            searchable
                            nothingFoundMessage="No projects found"
                            disabled={
                                disabled || isProjectsLoading || isProjectsError
                            }
                            onChange={(projectUuids) => {
                                if (
                                    isSelectionDraft &&
                                    projectUuids.length === 0
                                )
                                    return;
                                updateSettings({
                                    mcpProjectAccess: {
                                        mode: 'selected',
                                        projectUuids,
                                    },
                                });
                            }}
                        />
                        {isProjectsError && (
                            <InlineErrorState
                                message="Could not load projects"
                                onRetry={() => void refetchProjects()}
                            />
                        )}
                        {isSelectionDraft && (
                            <Text c="dimmed" fz="xs">
                                Select at least one project to apply
                            </Text>
                        )}
                        {!isSelectionDraft &&
                            selectedProjectUuids.length === 0 && (
                                <Callout
                                    variant="warning"
                                    title="No projects allowed"
                                >
                                    MCP clients cannot access any projects until
                                    you select at least one project.
                                </Callout>
                            )}
                    </>
                )}
            </Stack>
        </SettingsCard>
    );
};

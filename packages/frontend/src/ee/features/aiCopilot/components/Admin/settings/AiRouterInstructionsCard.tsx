import {
    Box,
    Button,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useBlocker } from 'react-router';
import { type SuggestionsItem } from '../../../../../../features/comments/types';
import { useActiveProjectUuid } from '../../../../../../hooks/useActiveProject';
import { useProjects } from '../../../../../../hooks/useProjects';
import { useTimeAgo } from '../../../../../../hooks/useTimeAgo';
import {
    useAiRouterInstruction,
    useUpsertAiRouterInstruction,
} from '../../../hooks/useAiRouter';
import { useProjectAiAgents } from '../../../hooks/useProjectAiAgents';
import { extractTaggedAgentUuids } from '../../../utils/aiRouterInstructions';
import { AiRouterInstructionsEditor } from './AiRouterInstructionsEditor';

// Split out so the relative-time hook only runs when there is a saved version.
const SavedAtLabel: FC<{ savedAt: Date | string }> = ({ savedAt }) => {
    const timeAgo = useTimeAgo(savedAt);
    return (
        <Text c="dimmed" fz="xs">
            Saved {timeAgo}
        </Text>
    );
};

type FormProps = {
    projectUuid: string;
    initialInstruction: string;
    savedAt: Date | string | null;
    suggestions: SuggestionsItem[];
    onDirtyChange: (isDirty: boolean) => void;
};

const AiRouterInstructionsForm: FC<FormProps> = ({
    projectUuid,
    initialInstruction,
    savedAt,
    suggestions,
    onDirtyChange,
}) => {
    const [draft, setDraft] = useState(initialInstruction);
    const { mutate: save, isLoading: isSaving } =
        useUpsertAiRouterInstruction(projectUuid);

    const hasChanges = draft.trim() !== initialInstruction.trim();
    const hasUnsavedChanges = hasChanges && !isSaving;

    // Surface dirtiness to the parent so it can guard project switches, which
    // remount this form and would otherwise discard the draft silently.
    useEffect(() => {
        onDirtyChange(hasUnsavedChanges);
        return () => onDirtyChange(false);
    }, [hasUnsavedChanges, onDirtyChange]);

    useBlocker(({ currentLocation, nextLocation }) => {
        if (
            !hasUnsavedChanges ||
            currentLocation.pathname === nextLocation.pathname
        ) {
            return false;
        }
        return !window.confirm(
            'You have unsaved routing instructions. Are you sure you want to leave without saving?',
        );
    });

    // Guards full-page unload (refresh, tab close) the in-app blocker can't see.
    useEffect(() => {
        if (!hasUnsavedChanges) return undefined;
        const handler = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [hasUnsavedChanges]);

    return (
        <Stack gap="xs">
            <AiRouterInstructionsEditor
                suggestions={suggestions}
                initialInstruction={initialInstruction}
                disabled={isSaving}
                onChange={setDraft}
            />
            <Group justify="flex-end" gap="md">
                {savedAt && <SavedAtLabel savedAt={savedAt} />}
                <Button
                    size="xs"
                    disabled={!hasChanges}
                    loading={isSaving}
                    onClick={() =>
                        save({
                            instruction: draft,
                            taggedAgentUuids: extractTaggedAgentUuids(draft),
                        })
                    }
                >
                    Save instructions
                </Button>
            </Group>
        </Stack>
    );
};

export const AiRouterInstructionsCard: FC = () => {
    const { data: projects, isInitialLoading: isProjectsLoading } =
        useProjects();
    const { activeProjectUuid, isLoading: isActiveProjectLoading } =
        useActiveProjectUuid();
    const [selectedProjectUuid, setSelectedProjectUuid] = useState<
        string | null
    >(null);
    const [isFormDirty, setIsFormDirty] = useState(false);

    const projectUuid =
        selectedProjectUuid ??
        activeProjectUuid ??
        projects?.[0]?.projectUuid ??
        null;

    // Switching projects remounts the form and discards its draft, which the
    // route/unload guards can't catch, so confirm here before changing.
    const handleProjectChange = (nextProjectUuid: string | null) => {
        if (
            isFormDirty &&
            nextProjectUuid !== projectUuid &&
            !window.confirm(
                'You have unsaved routing instructions. Are you sure you want to switch projects without saving?',
            )
        ) {
            return;
        }
        setSelectedProjectUuid(nextProjectUuid);
    };

    const agentsQuery = useProjectAiAgents({
        projectUuid: projectUuid ?? undefined,
        redirectOnUnauthorized: false,
    });
    const instructionQuery = useAiRouterInstruction(projectUuid ?? undefined);

    const suggestions = useMemo<SuggestionsItem[]>(
        () =>
            (agentsQuery.data ?? []).map((agent) => ({
                id: agent.uuid,
                label: agent.name,
                disabled: false,
            })),
        [agentsQuery.data],
    );

    const projectOptions = useMemo(
        () =>
            (projects ?? []).map((project) => ({
                value: project.projectUuid,
                label: project.name,
            })),
        [projects],
    );

    const isLoading =
        instructionQuery.isInitialLoading || agentsQuery.isInitialLoading;
    const hasTooFewAgents =
        !agentsQuery.isInitialLoading && suggestions.length < 2;

    return (
        <Stack gap="md">
            <Box>
                <Title order={6} mb={4}>
                    Routing instructions
                </Title>
                <Text c="dimmed" fz="xs">
                    Tell the router how to direct questions for a project. For
                    example, send billing questions to a specific agent. Type @
                    to tag an agent. Rules guide the router but never override
                    an agent's access restrictions.
                </Text>
            </Box>

            <Select
                label="Project"
                placeholder="Select a project"
                data={projectOptions}
                value={projectUuid}
                onChange={handleProjectChange}
                disabled={isProjectsLoading || isActiveProjectLoading}
                maw={320}
                searchable
            />

            {!isProjectsLoading && projectOptions.length === 0 && (
                <Text c="dimmed" fz="xs">
                    No projects available to configure.
                </Text>
            )}

            {projectUuid && hasTooFewAgents && (
                <Text c="dimmed" fz="xs">
                    This project has fewer than two accessible agents, so the
                    router won't run here yet. You can still prepare
                    instructions.
                </Text>
            )}

            {!projectUuid ? null : isLoading ? (
                <Group justify="center">
                    <Loader size="sm" />
                </Group>
            ) : (
                <AiRouterInstructionsForm
                    key={`${projectUuid}-${
                        instructionQuery.data?.instructionVersionUuid ?? 'new'
                    }`}
                    projectUuid={projectUuid}
                    initialInstruction={
                        instructionQuery.data?.instruction ?? ''
                    }
                    savedAt={instructionQuery.data?.createdAt ?? null}
                    suggestions={suggestions}
                    onDirtyChange={setIsFormDirty}
                />
            )}
        </Stack>
    );
};

import {
    Box,
    Button,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('aiCopilotAdmin');
    const timeAgo = useTimeAgo(savedAt);
    return (
        <Text c="dimmed" fz="xs">
            {t('settings.routing.savedAgo', { timeAgo })}
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
    const { t } = useTranslation('aiCopilotAdmin');
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
        return !window.confirm(t('settings.routing.confirmLeave'));
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
                    {t('settings.routing.save')}
                </Button>
            </Group>
        </Stack>
    );
};

export const AiRouterInstructionsCard: FC = () => {
    const { t } = useTranslation('aiCopilotAdmin');
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
            !window.confirm(t('settings.routing.confirmSwitch'))
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
                    {t('settings.routing.title')}
                </Title>
                <Text c="dimmed" fz="xs">
                    {t('settings.routing.description')}
                </Text>
            </Box>

            <Select
                label={t('settings.routing.project')}
                placeholder={t('settings.routing.selectProject')}
                data={projectOptions}
                value={projectUuid}
                onChange={handleProjectChange}
                disabled={isProjectsLoading || isActiveProjectLoading}
                maw={320}
                searchable
            />

            {!isProjectsLoading && projectOptions.length === 0 && (
                <Text c="dimmed" fz="xs">
                    {t('settings.routing.noProjects')}
                </Text>
            )}

            {projectUuid && hasTooFewAgents && (
                <Text c="dimmed" fz="xs">
                    {t('settings.routing.tooFewAgents')}
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

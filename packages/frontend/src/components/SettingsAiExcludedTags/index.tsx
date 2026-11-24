import { getErrorMessage, isApiError } from '@lightdash/common';
import {
    Button,
    Group,
    LoadingOverlay,
    Paper,
    Stack,
    TagsInput,
    Text,
    Title,
} from '@mantine/core';
import { IconTagsOff } from '@tabler/icons-react';
import { isEqual } from 'es-toolkit/compat';
import { useCallback, useMemo, useState, type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import {
    useAiExcludedTags,
    useProjectUpdateAiExcludedTags,
} from '../../hooks/useProject';
import MantineIcon from '../common/MantineIcon';
import { SettingsCard } from '../common/Settings/SettingsCard';

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

const AiExcludedTagsForm: FC<{
    isSaving: boolean;
    initialTags: string[];
    onSubmit: (tags: string[]) => void;
}> = ({ isSaving, initialTags, onSubmit }) => {
    const [tags, setTags] = useState<string[]>(initialTags);
    const hasChanged = !isEqual(sorted(tags), initialTags);

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                onSubmit(sorted(tags));
            }}
        >
            <TagsInput
                variant="subtle"
                size="xs"
                label="Excluded tags"
                placeholder={tags.length === 0 ? 'No tags excluded' : undefined}
                value={tags}
                onChange={setTags}
                clearable
            />

            <Group justify="flex-end" gap="xs" mt="md">
                <Button
                    type="button"
                    variant="default"
                    size="xs"
                    disabled={!hasChanged || isSaving}
                    onClick={() => setTags(initialTags)}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    size="xs"
                    disabled={!hasChanged}
                    loading={isSaving}
                >
                    Save changes
                </Button>
            </Group>
        </form>
    );
};

const SettingsAiExcludedTags: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { showToastError, showToastSuccess } = useToaster();
    const { data, isInitialLoading } = useAiExcludedTags(projectUuid);
    const mutation = useProjectUpdateAiExcludedTags(projectUuid);

    const initialTags = useMemo(() => sorted(data ?? []), [data]);

    const handleSubmit = useCallback(
        async (aiExcludedTags: string[]) => {
            try {
                await mutation.mutateAsync({ aiExcludedTags });
                showToastSuccess({
                    title: 'Successfully updated the tags never sent to AI',
                });
            } catch (e) {
                showToastError({
                    title: 'Failed to update the tags never sent to AI',
                    subtitle: isApiError(e)
                        ? e.error.message
                        : getErrorMessage(e),
                });
            }
        },
        [mutation, showToastError, showToastSuccess],
    );

    return (
        <SettingsCard p="xl" pos="relative">
            <LoadingOverlay visible={isInitialLoading} />

            <Stack gap="lg">
                <Group align="flex-start" gap="xs" wrap="nowrap">
                    <Paper p="xxs" radius="sm">
                        <MantineIcon icon={IconTagsOff} size="md" />
                    </Paper>
                    <Stack gap={2}>
                        <Title order={5}>Tags never sent to AI</Title>
                        <Text size="xs" c="dimmed">
                            Models, dimensions and metrics with one of these dbt
                            tags are hidden from every AI feature, and AI
                            requests that use them are refused. People can still
                            use them.
                        </Text>
                    </Stack>
                </Group>

                {!isInitialLoading && (
                    <AiExcludedTagsForm
                        key={initialTags.join('\n')}
                        isSaving={mutation.isLoading}
                        initialTags={initialTags}
                        onSubmit={handleSubmit}
                    />
                )}
            </Stack>
        </SettingsCard>
    );
};

export default SettingsAiExcludedTags;

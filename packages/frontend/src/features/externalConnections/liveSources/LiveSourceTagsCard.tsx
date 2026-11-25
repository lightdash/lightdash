/**
 * A live data source's tags, which its explores carry. An AI agent limited
 * to tags uses the source when they share one, as it does a dbt explore.
 */
import {
    LIVE_SOURCE_MAX_TAGS,
    LIVE_SOURCE_TAG_MAX_LENGTH,
} from '@lightdash/common';
import { Badge, Group, TagsInput } from '@mantine/core';
import { isEqual } from 'es-toolkit/compat';
import { useState, type FC, type FormEvent } from 'react';
import {
    LIVE_SOURCE_UPDATE_MESSAGES,
    useUpdateExternalConnection,
} from '../hooks/useUpdateExternalConnection';
import { type LiveSourceConnection } from './liveSourceRows';
import {
    SettingsCard,
    SettingsRow,
    SettingsSaveFooter,
    SettingsValue,
} from './LiveSourceSettingsRows';

export const LiveSourceTagsCard: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
}> = ({ projectUuid, connection }) => {
    const [savedTags, setSavedTags] = useState(connection.tags ?? []);
    const [tags, setTags] = useState(savedTags);
    const updateSource = useUpdateExternalConnection(
        LIVE_SOURCE_UPDATE_MESSAGES,
    );
    const isChanged = !isEqual(tags, savedTags);
    const [isEditing, setIsEditing] = useState(false);

    const cancel = () => {
        setTags(savedTags);
        setIsEditing(false);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!isChanged) return;
        try {
            await updateSource.mutateAsync({
                projectUuid,
                connectionUuid: connection.externalConnectionUuid,
                data: { tags },
            });
        } catch {
            // The hook already says why; the field keeps what was typed.
            return;
        }
        setSavedTags(tags);
        setIsEditing(false);
    };

    return (
        <SettingsCard
            title="AI agents"
            onSubmit={submit}
            edit={{ isEditing, onEdit: () => setIsEditing(true) }}
        >
            <SettingsRow
                label="Tags"
                hint="Agents limited to tags use this source when they share one"
            >
                {isEditing ? (
                    <TagsInput
                        w={240}
                        size="xs"
                        autoFocus
                        aria-label="Tags"
                        placeholder={tags.length ? undefined : 'Add a tag'}
                        maxTags={LIVE_SOURCE_MAX_TAGS}
                        maxLength={LIVE_SOURCE_TAG_MAX_LENGTH}
                        clearable
                        value={tags}
                        onChange={setTags}
                    />
                ) : savedTags.length > 0 ? (
                    <Group gap={4} justify="flex-end" maw={320}>
                        {savedTags.map((tag) => (
                            <Badge key={tag} variant="default" tt="none">
                                {tag}
                            </Badge>
                        ))}
                    </Group>
                ) : (
                    <SettingsValue isEmpty>No tags</SettingsValue>
                )}
            </SettingsRow>
            {isEditing ? (
                <SettingsSaveFooter
                    isChanged={isChanged}
                    isSaving={updateSource.isLoading}
                    onCancel={cancel}
                />
            ) : null}
        </SettingsCard>
    );
};

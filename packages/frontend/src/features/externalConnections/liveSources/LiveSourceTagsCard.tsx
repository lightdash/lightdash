/**
 * A live data source's tags, which its explores carry. An AI agent limited
 * to tags uses the source when they share one, as it does a dbt explore.
 */
import {
    LIVE_SOURCE_MAX_TAGS,
    LIVE_SOURCE_TAG_MAX_LENGTH,
} from '@lightdash/common';
import { Button, Group, TagsInput } from '@mantine/core';
import { isEqual } from 'es-toolkit/compat';
import { useState, type FC, type FormEvent } from 'react';
import {
    LIVE_SOURCE_UPDATE_MESSAGES,
    useUpdateExternalConnection,
} from '../hooks/useUpdateExternalConnection';
import { type LiveSourceConnection } from './liveSourceRows';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';
import rowClasses from './LiveSourceSettingsRows.module.css';

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
    };

    return (
        <SettingsCard title="AI agents" onSubmit={submit}>
            <SettingsRow
                label="Tags"
                hint="Agents limited to tags use this source when they share one"
            >
                <TagsInput
                    w={240}
                    size="xs"
                    aria-label="Tags"
                    placeholder={tags.length ? undefined : 'Add a tag'}
                    maxTags={LIVE_SOURCE_MAX_TAGS}
                    maxLength={LIVE_SOURCE_TAG_MAX_LENGTH}
                    clearable
                    value={tags}
                    onChange={setTags}
                />
            </SettingsRow>
            <Group
                justify="flex-end"
                gap="xs"
                className={rowClasses.settingsFooter}
            >
                <Button
                    size="xs"
                    variant="default"
                    disabled={!isChanged || updateSource.isLoading}
                    onClick={() => setTags(savedTags)}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    size="xs"
                    disabled={!isChanged}
                    loading={updateSource.isLoading}
                >
                    Save changes
                </Button>
            </Group>
        </SettingsCard>
    );
};

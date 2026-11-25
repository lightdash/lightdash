/**
 * A live data source's tags, which its explores carry. An AI agent limited
 * to tags uses the source when they share one, as it does a dbt explore.
 */
import {
    LIVE_SOURCE_MAX_TAGS,
    LIVE_SOURCE_TAG_MAX_LENGTH,
} from '@lightdash/common';
import { Badge, Group, TagsInput } from '@mantine/core';
import { type FC } from 'react';
import { SettingsRow, SettingsValue } from './LiveSourceSettingsRows';

export const LiveSourceTagsRow: FC<{
    isEditing: boolean;
    tags: string[];
    onChange: (tags: string[]) => void;
}> = ({ isEditing, tags, onChange }) => (
    <SettingsRow
        label="Tags"
        hint="Agents limited to tags use this source when they share one"
    >
        {isEditing ? (
            <TagsInput
                w={240}
                size="xs"
                aria-label="Tags"
                placeholder={tags.length ? undefined : 'Add a tag'}
                maxTags={LIVE_SOURCE_MAX_TAGS}
                maxLength={LIVE_SOURCE_TAG_MAX_LENGTH}
                clearable
                value={tags}
                onChange={onChange}
            />
        ) : tags.length > 0 ? (
            <Group gap={4} justify="flex-end" maw={320}>
                {tags.map((tag) => (
                    <Badge key={tag} variant="default" tt="none">
                        {tag}
                    </Badge>
                ))}
            </Group>
        ) : (
            <SettingsValue isEmpty>No tags</SettingsValue>
        )}
    </SettingsRow>
);

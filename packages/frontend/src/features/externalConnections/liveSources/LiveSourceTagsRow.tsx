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
import classes from './LiveSourceSettingsRows.module.css';

export const LiveSourceTagsRow: FC<{
    isEditing: boolean;
    tags: string[];
    onChange: (tags: string[]) => void;
}> = ({ isEditing, tags, onChange }) => (
    <SettingsRow label="Tags" hint="AI agents can be filtered using tags">
        {isEditing ? (
            <TagsInput
                w={320}
                classNames={{ inputField: classes.tagsField }}
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
                    <Badge key={tag} variant="default" tt="none" fw={400}>
                        {tag}
                    </Badge>
                ))}
            </Group>
        ) : (
            <SettingsValue isEmpty>No tags</SettingsValue>
        )}
    </SettingsRow>
);

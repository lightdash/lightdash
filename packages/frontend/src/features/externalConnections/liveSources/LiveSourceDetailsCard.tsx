/** What a live data source is: its explore prefix, name, AI hint and tags. */
import { LIVE_SOURCE_AI_HINT_MAX_LENGTH } from '@lightdash/common';
import { Code, Textarea, TextInput } from '@mantine/core';
import { IconId } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { type LiveSourceConnection } from './liveSourceRows';
import {
    EditableSettingsCard,
    SettingsRow,
    SettingsValue,
} from './LiveSourceSettingsRows';
import { LiveSourceTagsRow } from './LiveSourceTagsRow';
import { SETTINGS_FIELD_WIDTH } from './settingsLayout';
import { type LiveSourceForm } from './useLiveSourceForm';

export const LiveSourceDetailsCard: FC<{
    connection: LiveSourceConnection;
    source: LiveSourceForm;
}> = ({ connection, source }) => {
    const { form, details } = source;
    const [isEditing, setIsEditing] = useState(false);
    return (
        <EditableSettingsCard
            title="Details"
            icon={IconId}
            isEditing={isEditing}
            onEdit={() => setIsEditing(true)}
            onCancel={() => {
                details.revert();
                setIsEditing(false);
            }}
            onSave={() =>
                void details.save().then((isSaved) => {
                    if (isSaved) setIsEditing(false);
                })
            }
            isChanged={details.isChanged}
            isSaving={source.isSaving}
        >
            {(editing) => (
                <>
                    <SettingsRow
                        label="Explore prefix"
                        hint="Starts the name of each explore, and can't be changed"
                    >
                        {editing ? (
                            <TextInput
                                w={SETTINGS_FIELD_WIDTH}
                                size="xs"
                                aria-label="Explore prefix"
                                disabled
                                value={connection.liveSourceName ?? ''}
                                readOnly
                            />
                        ) : (
                            <Code fz="xs">
                                {connection.liveSourceName ?? '—'}
                            </Code>
                        )}
                    </SettingsRow>
                    <SettingsRow
                        label="Name"
                        hint="Shown in explores and to AI agents"
                    >
                        {editing ? (
                            <TextInput
                                w={SETTINGS_FIELD_WIDTH}
                                size="xs"
                                autoFocus
                                aria-label="Name"
                                {...form.getInputProps('name')}
                            />
                        ) : (
                            <SettingsValue>{form.values.name}</SettingsValue>
                        )}
                    </SettingsRow>
                    <SettingsRow
                        label="AI hint"
                        hint="Helps AI agents pick this source"
                    >
                        {editing ? (
                            <Textarea
                                w={SETTINGS_FIELD_WIDTH}
                                size="xs"
                                aria-label="AI hint"
                                placeholder="For example: EU storefront"
                                autosize
                                minRows={1}
                                maxRows={4}
                                maxLength={LIVE_SOURCE_AI_HINT_MAX_LENGTH}
                                {...form.getInputProps('aiHint')}
                            />
                        ) : (
                            <SettingsValue isEmpty={!form.values.aiHint}>
                                {form.values.aiHint || 'Not set'}
                            </SettingsValue>
                        )}
                    </SettingsRow>
                    <LiveSourceTagsRow
                        isEditing={editing}
                        tags={form.values.tags}
                        onChange={(tags) => form.setFieldValue('tags', tags)}
                    />
                </>
            )}
        </EditableSettingsCard>
    );
};

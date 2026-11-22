import { LIVE_SOURCE_AI_HINT_MAX_LENGTH } from '@lightdash/common';
import { Textarea, TextInput } from '@mantine/core';
import { type GetInputPropsReturnType } from '@mantine/form';
import { type FC } from 'react';
import { type useNewSourceId } from '../hooks/useNewSourceId';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';

const NEW_LIVE_SOURCE_FIELD_WIDTH = 240;

/** What a new source is called and how agents see it, the same rows as its settings. */
export const NewLiveSourceDetails: FC<{
    nameProps: GetInputPropsReturnType;
    sourceId: ReturnType<typeof useNewSourceId>;
    /** Left out where the source is saved only after signing in elsewhere. */
    aiHintProps?: GetInputPropsReturnType;
}> = ({ nameProps, sourceId, aiHintProps }) => (
    <SettingsCard title="Details">
        <SettingsRow label="Name" hint="Shown in explores and to agents">
            <TextInput
                w={NEW_LIVE_SOURCE_FIELD_WIDTH}
                size="xs"
                aria-label="Name"
                {...nameProps}
            />
        </SettingsRow>
        <SettingsRow
            label="Explore prefix"
            hint={
                sourceId.error ??
                "Added to the start of each explore name, can't be changed later"
            }
        >
            <TextInput
                w={NEW_LIVE_SOURCE_FIELD_WIDTH}
                size="xs"
                aria-label="Explore prefix"
                value={sourceId.value}
                error={sourceId.error !== null}
                onChange={(event) =>
                    sourceId.onChange(event.currentTarget.value)
                }
            />
        </SettingsRow>
        {aiHintProps ? (
            <SettingsRow label="AI hint" hint="Helps agents pick this source">
                <Textarea
                    w={NEW_LIVE_SOURCE_FIELD_WIDTH}
                    size="xs"
                    aria-label="AI hint"
                    placeholder="For example: EU storefront"
                    autosize
                    minRows={1}
                    maxRows={4}
                    maxLength={LIVE_SOURCE_AI_HINT_MAX_LENGTH}
                    {...aiHintProps}
                />
            </SettingsRow>
        ) : null}
    </SettingsCard>
);

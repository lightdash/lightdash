import { LIVE_SOURCE_AI_HINT_MAX_LENGTH } from '@lightdash/common';
import { Textarea, type TextareaProps } from '@mantine/core';
import { type FC } from 'react';

/** What an admin tells the AI agent about a source, on its edit form. */
export const LiveSourceHintField: FC<TextareaProps> = (props) => (
    <Textarea
        label="AI hint"
        description="Helps agents pick this source"
        placeholder="For example: EU storefront, used for checkout questions"
        autosize
        minRows={2}
        maxRows={5}
        maxLength={LIVE_SOURCE_AI_HINT_MAX_LENGTH}
        {...props}
    />
);

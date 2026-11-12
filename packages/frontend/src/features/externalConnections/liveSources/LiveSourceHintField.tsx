import { LIVE_SOURCE_AI_HINT_MAX_LENGTH } from '@lightdash/common';
import { Textarea, type TextareaProps } from '@mantine/core';
import { type FC } from 'react';

/** What an admin tells the AI agent about a source, on its edit form. */
export const LiveSourceHintField: FC<TextareaProps> = (props) => (
    <Textarea
        label="What is this source used for?"
        description="Helps the AI agent pick the right source. It already knows what the source connects to."
        placeholder="For example: EU storefront, used for checkout questions"
        autosize
        minRows={2}
        maxRows={5}
        maxLength={LIVE_SOURCE_AI_HINT_MAX_LENGTH}
        {...props}
    />
);

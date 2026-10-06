import { Anchor } from '@mantine/core';
import { type FC } from 'react';
import { AI_CREDITS_SUPPORT_EMAIL } from './creditUsage';

export const AiCreditsContactUs: FC<{ lead: string }> = ({ lead }) => (
    <>
        {lead} contact us at{' '}
        <Anchor
            inherit
            c="var(--mantine-color-text)"
            underline="always"
            href={`mailto:${AI_CREDITS_SUPPORT_EMAIL}`}
        >
            {AI_CREDITS_SUPPORT_EMAIL}
        </Anchor>{' '}
        or in your usual support channel.
    </>
);

import { Anchor } from '@mantine/core';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { AI_CREDITS_SUPPORT_EMAIL } from './creditUsage';

export const AiCreditsContactUs: FC<{ lead: string }> = ({ lead }) => {
    const { t } = useTranslation('eeMisc');
    return (
        <Trans
            t={t}
            i18nKey="aiCredits.contactUs"
            values={{ lead, email: AI_CREDITS_SUPPORT_EMAIL }}
            components={{
                anchor: (
                    <Anchor
                        inherit
                        c="var(--mantine-color-text)"
                        underline="always"
                        href={`mailto:${AI_CREDITS_SUPPORT_EMAIL}`}
                    />
                ),
            }}
        />
    );
};

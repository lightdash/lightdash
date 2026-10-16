import { Anchor, Text } from '@mantine/core';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { SlackStates } from '../types';

type Props = {
    slackState: SlackStates;
    missingScopes: string[];
};

export const SchedulerFormSlackError: FC<Props> = ({
    slackState,
    missingScopes,
}) => {
    const { t } = useTranslation('scheduler');
    if (slackState === SlackStates.NO_SLACK) {
        return (
            <>
                <Text pb="sm">{t('slackError.noIntegration')}</Text>
                <Text>
                    <Trans
                        t={t}
                        i18nKey="slackError.setupSlack"
                        components={{
                            anchor: (
                                <Anchor
                                    target="_blank"
                                    href="https://docs.lightdash.com/self-host/customize-deployment/configure-a-slack-app-for-lightdash"
                                />
                            ),
                        }}
                    />
                </Text>
            </>
        );
    } else if (slackState === SlackStates.MISSING_SCOPES) {
        return (
            <>
                <Text pb="sm">{t('slackError.missingPermissions')}</Text>
                <Text pb="sm">
                    <Trans
                        t={t}
                        i18nKey="slackError.missingScopes"
                        values={{ scopes: missingScopes.join(', ') }}
                        components={{ scopes: <Text span fw={600} /> }}
                    />
                </Text>
                <Text>
                    <Trans
                        t={t}
                        i18nKey="slackError.reinstall"
                        components={{
                            anchor: (
                                <Anchor href="/generalSettings/integrations" />
                            ),
                        }}
                    />
                </Text>
            </>
        );
    }
    return <></>;
};

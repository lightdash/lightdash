import { Anchor, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { SlackStates } from '../types';

type Props = {
    slackState: SlackStates;
};

export const SchedulerFormSlackError: FC<Props> = ({ slackState }) => {
    if (slackState === SlackStates.NO_SLACK) {
        return (
            <>
                <Text pb="sm">No Slack integration found</Text>
                <Text>
                    To create a slack scheduled delivery, you need to
                    <Anchor
                        target="_blank"
                        href="https://docs.lightdash.com/self-host/customize-deployment/configure-a-slack-app-for-lightdash"
                    >
                        {' '}
                        setup Slack{' '}
                    </Anchor>
                    for your Lightdash instance
                </Text>
            </>
        );
    } else if (slackState === SlackStates.MISSING_SCOPES) {
        return (
            <>
                <Text pb="sm">Slack integration needs to be reinstalled</Text>
                <Text>
                    To create a slack scheduled delivery, you need to
                    <Anchor href="/generalSettings/integrations">
                        {' '}
                        reinstall the Slack integration{' '}
                    </Anchor>
                    for your organization
                </Text>
            </>
        );
    }
    return <></>;
};

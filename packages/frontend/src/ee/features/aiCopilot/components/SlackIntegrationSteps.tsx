import { Anchor, Code, Stepper } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useGetSlack } from '../../../../hooks/slack/useSlack';

export const SlackIntegrationSteps: FC<{
    slackInstallation: boolean;
    channelsConfigured: boolean;
}> = (props) => {
    const { data } = useGetSlack();
    const active = props.channelsConfigured
        ? 2
        : props.slackInstallation
        ? 1
        : 0;
    return (
        <Stepper active={active} size="xs" orientation="horizontal">
            <Stepper.Step
                label="Allow integration access"
                description={
                    active === 0 ? (
                        <Anchor
                            component={Link}
                            to="/generalSettings/integrations"
                            variant="link"
                            size="sm"
                        >
                            Connect your Slack account to Lightdash
                        </Anchor>
                    ) : null
                }
            />
            <Stepper.Step
                label="Select channels"
                description={
                    active === 1
                        ? 'Select the channels you want to connect to this agent'
                        : null
                }
            />
            <Stepper.Step
                label="Start using agent"
                description={
                    active === 2 ? (
                        <>
                            Go to the connected channels and tag the Slack app{' '}
                            {data?.appName ? (
                                <>
                                    <Code fw={500} c="blue" fz={10}>
                                        @{data?.appName}
                                    </Code>{' '}
                                    to interact with your agent
                                </>
                            ) : (
                                'to interact with your agent'
                            )}
                        </>
                    ) : null
                }
            />
        </Stepper>
    );
};

import { Anchor, Stepper } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';

export const SlackIntegrationSteps: FC<{
    slackInstallation: boolean;
    channelsConfigured: boolean;
}> = (props) => {
    const active = props.channelsConfigured
        ? 2
        : props.slackInstallation
        ? 1
        : 0;
    return (
        <Stepper active={active} size="sm" orientation="horizontal">
            <Stepper.Step
                label="Allow Integration access"
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
                label="Select Channels"
                description={
                    active === 1
                        ? 'Select the channels you want to connect to this agent'
                        : null
                }
            />
            <Stepper.Step
                label="Start Using Agent"
                description={
                    active === 2
                        ? 'Go to the connected channels and tag the agent to start using it'
                        : null
                }
            />
        </Stepper>
    );
};

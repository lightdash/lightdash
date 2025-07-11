import { Button } from '@mantine/core';
import { IconBrandSlack } from '@tabler/icons-react';
import { EmptyState } from '../../components/common/EmptyState';
import MantineIcon from '../../components/common/MantineIcon';

export const SlackAuthSuccess = () => {
    return (
        <EmptyState
            icon={
                <MantineIcon
                    icon={IconBrandSlack}
                    color="green.6"
                    stroke={1}
                    size="5xl"
                />
            }
            title="Slack connected successfully!"
            description="Your Slack account is now connected to Lightdash. You can now use AI Agent by mentioning the bot in your Slack channels."
        >
            <Button onClick={() => window.open('slack://open', '_blank')}>
                Open Slack
            </Button>
        </EmptyState>
    );
};

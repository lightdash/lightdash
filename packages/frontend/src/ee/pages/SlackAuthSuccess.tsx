import { Button } from '@mantine/core';
import { IconBrandSlack } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState } from '../../components/common/EmptyState';
import MantineIcon from '../../components/common/MantineIcon';

export const SlackAuthSuccess = () => {
    const [searchParams] = useSearchParams();

    const slackUrl = useMemo(() => {
        const team = searchParams.get('team');
        const channel = searchParams.get('channel');
        const message = searchParams.get('message');
        const threadTs = searchParams.get('thread_ts');

        if (team && channel) {
            let url = `slack://channel?team=${team}&id=${channel}`;

            if (message) {
                url += `&message=${message}`;

                if (threadTs) {
                    url += `&thread_ts=${threadTs}`;
                }
            }

            return url;
        }

        return 'slack://open';
    }, [searchParams]);

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
            <Button onClick={() => window.open(slackUrl)}>Open Slack</Button>
        </EmptyState>
    );
};

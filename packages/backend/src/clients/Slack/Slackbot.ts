import { App, ExpressReceiver, LogLevel } from '@slack/bolt';
import { apiV1Router } from '../../routers/apiV1Router';
import { slackService } from '../../services/services';
import { slackOptions } from './SlackOptions';

const slackReceiver = new ExpressReceiver({
    ...slackOptions,
    router: apiV1Router,
});

export const startSlackBot = async () => {
    if (process.env.SLACK_APP_TOKEN) {
        try {
            await slackReceiver.start(parseInt('3001', 10));

            const app = new App({
                ...slackOptions,
                logLevel: LogLevel.INFO,
                port: parseInt(process.env.SLACK_PORT || '4000', 10),
                socketMode: true,
                appToken: process.env.SLACK_APP_TOKEN,
            });

            app.event('link_shared', async (message: any) => {
                const { event, client, context } = message;
                await slackService.unfurl(event, client, context);
            });

            await app.start();

            console.debug('Slack app is running');
        } catch (e: unknown) {
            console.error(`Unable to start Slack app ${e}`);
        }
    } else {
        console.warn(`Missing "SLACK_APP_TOKEN", Slack App will not run`);
    }
};

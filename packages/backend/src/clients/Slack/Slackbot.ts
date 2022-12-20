import { App, ExpressReceiver, LogLevel } from '@slack/bolt';

import { analytics } from '../../analytics/client';
import Logger from '../../logger';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import { apiV1Router } from '../../routers/apiV1Router';
import { unfurlService } from '../../services/services';
import { LightdashPage } from '../../services/UnfurlService/UnfurlService';
import { slackOptions } from './SlackOptions';
import { unfurlChartAndDashboard, unfurlExplore } from './SlackUnfurl';

const notifySlackError = async (
    error: unknown,
    url: string,
    client: any,
    event: any,
): Promise<void> => {
    /** Expected slack errors:
     * - cannot_parse_attachment: Means the image on the blocks is not accessible from slack, is the URL public ?
     */
    Logger.error(`Unable to unfurl slack URL ${url}: ${error} `);

    const unfurls = {
        [url]: {
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `Unable to unfurl slack URL ${url}: ${error} `,
                    },
                },
            ],
        },
    };
    await client.chat
        .unfurl({
            ts: event.message_ts,
            channel: event.channel,
            unfurls,
        })
        .catch((er: any) =>
            Logger.error(`Unable to unfurl slack URL ${url}: ${error} `),
        );
};

type SlackServiceDependencies = {
    slackAuthenticationModel: SlackAuthenticationModel;
};

export class SlackService {
    slackAuthenticationModel: SlackAuthenticationModel;

    constructor({ slackAuthenticationModel }: SlackServiceDependencies) {
        this.slackAuthenticationModel = slackAuthenticationModel;
        this.start();
    }

    async start() {
        if (process.env.SLACK_APP_TOKEN) {
            try {
                const slackReceiver = new ExpressReceiver({
                    ...slackOptions,
                    installationStore: {
                        storeInstallation: (i) =>
                            this.slackAuthenticationModel.createInstallation(i),
                        fetchInstallation: (i) =>
                            this.slackAuthenticationModel.getInstallation(i),
                        deleteInstallation: (i) =>
                            this.slackAuthenticationModel.deleteInstallation(i),
                    },
                    router: apiV1Router,
                });

                await slackReceiver.start(parseInt('4001', 10));

                const app = new App({
                    ...slackOptions,
                    installationStore: {
                        storeInstallation: (i) =>
                            this.slackAuthenticationModel.createInstallation(i),
                        fetchInstallation: (i) =>
                            this.slackAuthenticationModel.getInstallation(i),
                    },
                    logLevel: LogLevel.INFO,
                    port: parseInt(process.env.SLACK_PORT || '4000', 10),
                    socketMode: true,
                    appToken: process.env.SLACK_APP_TOKEN,
                });

                app.event('link_shared', (m) => this.unfurlSlackUrls(m));

                await app.start();
            } catch (e: unknown) {
                Logger.error(`Unable to start Slack app ${e}`);
            }
        } else {
            Logger.warn(`Missing "SLACK_APP_TOKEN", Slack App will not run`);
        }
    }

    async unfurlSlackUrls(message: any) {
        const { event, client, context } = message;
        Logger.debug(`Got link_shared slack event ${event.message_ts}`);
        event.links.map(async (l: any, index: number) => {
            const eventUserId = context.botUserId;

            try {
                const { teamId } = context;
                const imageId = `slack-image-${context.teamId}-${event.unfurl_id}-${index}`;
                const authUserUuid =
                    await this.slackAuthenticationModel.getUserUuid(teamId);

                analytics.track({
                    event: 'share_slack.unfurl',
                    userId: eventUserId,
                    properties: {},
                });

                const unfurl = await unfurlService.unfurl(
                    l.url,
                    imageId,
                    authUserUuid,
                );
                if (unfurl) {
                    const blocks =
                        unfurl?.pageType === LightdashPage.EXPLORE
                            ? unfurlExplore(l.url, unfurl)
                            : unfurlChartAndDashboard(l.url, unfurl);
                    client.chat
                        .unfurl({
                            ts: event.message_ts,
                            channel: event.channel,
                            unfurls: blocks,
                        })
                        .catch((e: any) => {
                            analytics.track({
                                event: 'share_slack.unfurl_error',
                                userId: event.user,
                                properties: {
                                    error: `${e}`,
                                },
                            });
                            Logger.error(
                                `Unable to unfurl on slack ${JSON.stringify(
                                    blocks,
                                )}: ${JSON.stringify(e)}`,
                            );
                        });
                }
            } catch (e) {
                analytics.track({
                    event: 'share_slack.unfurl_error',
                    userId: eventUserId,

                    properties: {
                        error: `${e}`,
                    },
                });

                notifySlackError(e, l.url, client, event);
            }
        });
    }
}

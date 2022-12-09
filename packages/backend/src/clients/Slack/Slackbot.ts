import { App, ExpressReceiver, InstallationQuery, LogLevel } from '@slack/bolt';

import { analytics } from '../../analytics/client';
import database from '../../database/database';
import Logger from '../../logger';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import { apiV1Router } from '../../routers/apiV1Router';
import {
    LightdashPage,
    UnfurlService,
} from '../../services/UnfurlService/UnfurlService';
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
    Logger.error(`Unable to unfurl url ${JSON.stringify(error)}`);

    const unfurls = {
        [url]: {
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `Unable to unfurl URL ${url}: ${error} `,
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
            Logger.error(`Unable to unfurl url ${JSON.stringify(er)}`),
        );
};

type SlackServiceDependencies = {
    slackAuthenticationModel: SlackAuthenticationModel;
    unfurlService: UnfurlService;
};

const slackAuthenticationModel = new SlackAuthenticationModel({
    database,
});
const slackReceiver = new ExpressReceiver({
    ...slackOptions,
    installationStore: {
        storeInstallation: slackAuthenticationModel.createInstallation,
        fetchInstallation: slackAuthenticationModel.getInstallation,
        deleteInstallation: slackAuthenticationModel.deleteInstallation,
    },
    router: apiV1Router,
});

export class SlackService {
    slackAuthenticationModel: SlackAuthenticationModel;

    unfurlService: UnfurlService;

    constructor({
        slackAuthenticationModel: notworking,
        unfurlService,
    }: SlackServiceDependencies) {
        console.debug(
            'SlackService constructor slackAuthenticationModel',
            slackAuthenticationModel !== undefined,
        );
        this.slackAuthenticationModel = new SlackAuthenticationModel({
            database,
        });
        this.unfurlService = unfurlService;
        console.debug(
            'SlackService constructor',
            this.slackAuthenticationModel !== undefined,
        );

        this.start();
    }

    async redirectEvent(installQuery: InstallationQuery<boolean>) {
        console.debug('SlackService redirect', this.slackAuthenticationModel);
        return this.slackAuthenticationModel.getInstallation(installQuery);
    }

    async start() {
        if (process.env.SLACK_APP_TOKEN) {
            try {
                await slackReceiver.start(parseInt('4001', 10));

                const app = new App({
                    ...slackOptions,
                    installationStore: {
                        storeInstallation:
                            this.slackAuthenticationModel.createInstallation,
                        fetchInstallation: this.redirectEvent,
                    },
                    logLevel: LogLevel.INFO,
                    port: parseInt(process.env.SLACK_PORT || '4000', 10),
                    socketMode: true,
                    appToken: process.env.SLACK_APP_TOKEN,
                });

                app.event('link_shared', this.unfurlSlackUrls);

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
            try {
                const eventUserId = context.user;
                const { teamId } = context;
                const imageId = `slack-image-${context.teamId}-${event.unfurl_id}-${index}`;
                const authUserUuid =
                    await this.slackAuthenticationModel.getUserUuid(teamId);

                analytics.track({
                    event: 'share_slack.unfurl',
                    userId: eventUserId,
                    properties: {},
                });

                const unfurl = await this.unfurlService.unfurl(
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
                            blocks,
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
                                `Unable to unfurl ${blocks}: ${JSON.stringify(
                                    e,
                                )}`,
                            );
                        });
                }
            } catch (e) {
                analytics.track({
                    event: 'share_slack.unfurl_error',
                    userId: event.userId,

                    properties: {
                        error: `${e}`,
                    },
                });

                notifySlackError(e, l.url, client, event);
            }
        });
    }
}

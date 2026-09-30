import {
    AllMiddlewareArgs,
    SlackEventMiddlewareArgs,
    StringIndexed,
} from '@slack/bolt';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { BaseService } from '../BaseService';
import { UnfurlService } from '../UnfurlService/UnfurlService';

export type SlackServiceArguments = {
    slackClient: SlackClient;
    unfurlService: UnfurlService;
};

export class SlackService extends BaseService {
    protected slackClient: SlackClient;

    private unfurlService: UnfurlService;

    constructor(args: SlackServiceArguments) {
        super();
        this.slackClient = args.slackClient;
        this.unfurlService = args.unfurlService;
    }

    setupEventListeners() {
        const slackApp = this.slackClient.getApp();

        if (!slackApp) {
            throw new Error('Slack app not found');
        }

        slackApp.event('link_shared', (m) =>
            this.unfurlService.unfurlSlackUrls(m),
        );
    }
}

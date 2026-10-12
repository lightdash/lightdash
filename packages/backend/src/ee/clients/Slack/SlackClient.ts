import {
    SlackClient,
    SlackClientArguments,
} from '../../../clients/Slack/SlackClient';
import { CommercialSlackAuthenticationModel } from '../../models/CommercialSlackAuthenticationModel';

type CommercialSlackClientArguments = Omit<
    SlackClientArguments,
    'slackAuthenticationModel'
> & {
    slackAuthenticationModel: CommercialSlackAuthenticationModel;
};

export class CommercialSlackClient extends SlackClient {
    slackAuthenticationModel: CommercialSlackAuthenticationModel;

    constructor(args: CommercialSlackClientArguments) {
        super(args);
        this.slackAuthenticationModel = args.slackAuthenticationModel;
    }

    // eslint-disable-next-line class-methods-use-this
    protected isCommercial(): boolean {
        return true;
    }
}

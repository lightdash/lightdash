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

    public getRequiredScopes() {
        return [
            ...super.getRequiredScopes(),
            'channels:history',
            'groups:history',
        ];
    }

    public getSlackOptions() {
        return {
            ...super.getSlackOptions(),
            scopes: this.getRequiredScopes(),
        };
    }

    public hasRequiredScopes(installationScopes: string[]) {
        const requiredScopes = this.getRequiredScopes();
        return requiredScopes.every((scope) =>
            installationScopes.includes(scope),
        );
    }
}

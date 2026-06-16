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

    public getRequiredScopes({
        includeAiAgentSlackModernScopes = false,
    }: {
        includeAiAgentSlackModernScopes?: boolean;
    } = {}) {
        const scopes = [
            ...super.getRequiredScopes(),
            'channels:history',
            'groups:history',
        ];

        if (includeAiAgentSlackModernScopes) {
            scopes.push('assistant:write', 'im:history');
        }

        return scopes;
    }

    public getSlackOptions({
        includeAiAgentSlackModernScopes = false,
    }: {
        includeAiAgentSlackModernScopes?: boolean;
    } = {}) {
        return {
            ...super.getSlackOptions(),
            scopes: this.getRequiredScopes({
                includeAiAgentSlackModernScopes,
            }),
        };
    }

    public hasRequiredScopes(
        installationScopes: string[],
        {
            includeAiAgentSlackModernScopes = false,
        }: {
            includeAiAgentSlackModernScopes?: boolean;
        } = {},
    ) {
        const requiredScopes = this.getRequiredScopes({
            includeAiAgentSlackModernScopes,
        });
        return requiredScopes.every((scope) =>
            installationScopes.includes(scope),
        );
    }
}

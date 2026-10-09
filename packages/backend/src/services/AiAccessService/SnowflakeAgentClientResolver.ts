import { type SnowflakeAgentClientSource } from '@lightdash/common';
import { type LightdashConfig } from '../../config/parseConfig';
import {
    getSnowflakeAgentMissingOAuthSettings,
    getSnowflakeAiAccount,
} from '../../config/snowflakeAgentConfiguration';
import { type OrganizationSnowflakeAgentClientModel } from '../../models/OrganizationSnowflakeAgentClientModel';

export type ResolvedSnowflakeAgentClient = {
    source: SnowflakeAgentClientSource;
    organizationUuid: string;
    clientVersion: string | null;
    clientId: string;
    clientSecret: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    account: string;
    accessUrl: string;
};

export class SnowflakeAgentClientResolver {
    constructor(
        private readonly args: {
            lightdashConfig: LightdashConfig;
            organizationSnowflakeAgentClientModel: Pick<
                OrganizationSnowflakeAgentClientModel,
                'getWithSecret'
            >;
        },
    ) {}

    async resolve(
        organizationUuid: string,
    ): Promise<ResolvedSnowflakeAgentClient | null> {
        const client =
            await this.args.organizationSnowflakeAgentClientModel.getWithSecret(
                organizationUuid,
            );
        if (client) {
            return {
                source: 'organization',
                organizationUuid,
                clientVersion: client.clientVersion,
                clientId: client.clientId,
                clientSecret: client.clientSecret,
                authorizationEndpoint: `${client.accountUrl}/oauth/authorize`,
                tokenEndpoint: `${client.accountUrl}/oauth/token-request`,
                account: client.accountIdentifier,
                accessUrl: client.accountUrl,
            };
        }
        const config = this.args.lightdashConfig.auth.snowflakeAi;
        if (getSnowflakeAgentMissingOAuthSettings(config).length > 0)
            return null;
        return {
            source: 'environment',
            organizationUuid,
            clientVersion: null,
            clientId: config.clientId!,
            clientSecret: config.clientSecret!,
            authorizationEndpoint: config.authorizationEndpoint!,
            tokenEndpoint: config.tokenEndpoint!,
            account: getSnowflakeAiAccount(config)!,
            accessUrl: new URL(config.tokenEndpoint!).origin,
        };
    }

    async getMissingSettings(organizationUuid: string): Promise<string[]> {
        return [
            ...((await this.resolve(organizationUuid))
                ? []
                : getSnowflakeAgentMissingOAuthSettings(
                      this.args.lightdashConfig.auth.snowflakeAi,
                  )),
            ...(this.args.lightdashConfig.license.licenseKey === undefined
                ? ['Enterprise licence']
                : []),
        ];
    }

    async isConfigured(organizationUuid: string): Promise<boolean> {
        return (await this.getMissingSettings(organizationUuid)).length === 0;
    }
}

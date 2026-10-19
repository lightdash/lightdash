import {
    ParameterError,
    type SnowflakeAgentClientSource,
} from '@lightdash/common';
import { type LightdashConfig } from '../../config/parseConfig';
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
        return null;
    }

    async getMissingSettings(
        organizationUuid: string,
        client?: ResolvedSnowflakeAgentClient | null,
    ): Promise<string[]> {
        let resolved: ResolvedSnowflakeAgentClient | null;
        try {
            resolved =
                client === undefined
                    ? await this.resolve(organizationUuid)
                    : client;
        } catch (error) {
            if (!(error instanceof ParameterError)) throw error;
            return [
                'Snowflake client secret (replace it)',
                ...(this.args.lightdashConfig.license.licenseKey == null
                    ? ['Enterprise licence']
                    : []),
            ];
        }
        return [
            ...(resolved ? [] : ['Snowflake OAuth client']),
            ...(this.args.lightdashConfig.license.licenseKey == null
                ? ['Enterprise licence']
                : []),
        ];
    }

    async isConfigured(organizationUuid: string): Promise<boolean> {
        return (await this.getMissingSettings(organizationUuid)).length === 0;
    }
}

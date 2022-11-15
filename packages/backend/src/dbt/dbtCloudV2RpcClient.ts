import { DbtError, LightdashError, NetworkError } from '@lightdash/common';
import { DbtRpcClientBase, DEFAULT_HEADERS } from './dbtRpcClientBase';

export class DbtCloudV2RpcClient extends DbtRpcClientBase {
    static baseServerUrl: string = 'https://cloud.getdbt.com/api/v2';

    unreachableMessage: string;

    constructor(
        accountId: string | number,
        environmentId: string | number,
        projectId: string | number,
        apiKey: string,
    ) {
        super(
            `${DbtCloudV2RpcClient.baseServerUrl}/accounts/${accountId}/environments/${environmentId}/develop`,
            { ...DEFAULT_HEADERS, Authorization: `Bearer ${apiKey}` },
        );
        const ideUrl = `https://cloud.getdbt.com/#/accounts/${accountId}/projects/${projectId}/develop/`;
        const credentialsUrl = `https://cloud.getdbt.com/#/accounts/${accountId}/projects/${projectId}/environments/${environmentId}/`;
        this.unreachableMessage = `Cannot connect to dbt Cloud development environment. You must have your project open at ${ideUrl} and have correctly configured developer credentials: ${credentialsUrl}. Please refresh dbt to try again.`;
    }

    // Extend _post to improve error messsages
    async _post(method: string, params: Record<string, any>) {
        try {
            return await super._post(method, params);
        } catch (e) {
            if (e instanceof NetworkError) {
                // handle common dbt Cloud expected responses
                if (
                    e.data.status?.code &&
                    e.data.status?.is_success === false &&
                    e.data.status?.user_message
                ) {
                    throw new DbtError(
                        `Dbt Cloud error:\n${e.data.status.user_message}`,
                    );
                }
                if (e.data.detail) {
                    throw new NetworkError(
                        `Unexpected response received from dbt cloud: ${e.data.detail}`,
                        e.data,
                    );
                }
                throw new NetworkError(
                    `${e.message}\n${this.unreachableMessage}`,
                    e.data,
                );
            }
            throw e;
        }
    }

    // Extend isServerReady with improved error messages
    async _isServerReady(): Promise<boolean> {
        try {
            return await super._isServerReady();
        } catch (e) {
            if (e instanceof LightdashError) {
                e.message = `${e.message}\n${this.unreachableMessage}`;
                throw e;
            }
            throw e;
        }
    }
}

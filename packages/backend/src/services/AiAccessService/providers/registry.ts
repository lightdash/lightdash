import { WarehouseTypes } from '@lightdash/common';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { type SnowflakeAgentClientResolver } from '../SnowflakeAgentClientResolver';
import { type AiCredentialProvider } from './AiCredentialProvider';
import { SnowflakeAiCredentialProvider } from './SnowflakeAiCredentialProvider';

export type AiCredentialProviderRegistry = (
    type: WarehouseTypes,
) => AiCredentialProvider | null;

export type AiCredentialProviderDependencies = {
    lightdashConfig: LightdashConfig;
    snowflakeAgentClientResolver: Pick<SnowflakeAgentClientResolver, 'resolve'>;
    userWarehouseCredentialsModel: UserWarehouseCredentialsModel;
};

export const createAiCredentialProviderRegistry =
    (deps: AiCredentialProviderDependencies): AiCredentialProviderRegistry =>
    (type) =>
        type === WarehouseTypes.SNOWFLAKE
            ? new SnowflakeAiCredentialProvider(deps)
            : null;

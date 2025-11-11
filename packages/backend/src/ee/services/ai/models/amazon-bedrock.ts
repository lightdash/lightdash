import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { LightdashConfig } from '../../../../config/parseConfig';
import { AiModel } from './types';

const PROVIDER = 'bedrock';

export const getAmazonBedrockModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['bedrock']
    >,
): AiModel<typeof PROVIDER> => {
    const bedrockConfig = {
        region: config.region,
        baseURL: config.baseURL,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
    };

    const bedrock = createAmazonBedrock(bedrockConfig);

    const model = bedrock(config.modelName);

    return {
        model,
        callOptions: {
            temperature: config.temperature,
        },
        providerOptions: undefined,
    };
};

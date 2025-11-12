import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { LightdashConfig } from '../../../../config/parseConfig';
import { AiModel } from './types';

const PROVIDER = 'bedrock';

export const getBedrockModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['bedrock']
    >,
): AiModel<typeof PROVIDER> => {
    // Support both API key and IAM credentials authentication
    const bedrock =
        'apiKey' in config
            ? createAmazonBedrock({
                  apiKey: config.apiKey,
                  ...(config.region ? { region: config.region } : {}),
              })
            : createAmazonBedrock({
                  region: config.region,
                  accessKeyId: config.accessKeyId,
                  secretAccessKey: config.secretAccessKey,
                  ...(config.sessionToken
                      ? { sessionToken: config.sessionToken }
                      : {}),
              });

    const model = bedrock(config.modelName);

    return {
        model,
        callOptions: {
            temperature: config.temperature,
        },
        providerOptions: undefined,
    };
};

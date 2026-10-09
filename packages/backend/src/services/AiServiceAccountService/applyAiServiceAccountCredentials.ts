import {
    WarehouseTypes,
    type AiServiceAccountCredentialInput,
} from '@lightdash/common';
import {
    parseAiServiceAccountSecrets,
    type AiServiceAccountSecrets,
} from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { buildAiServiceAccountCredentials } from '../WarehouseClientFactory/aiServiceAccountCredentialResolvers';

export const mergeAiServiceAccountCredentials = (
    input: AiServiceAccountCredentialInput,
    saved: AiServiceAccountSecrets | null,
): AiServiceAccountSecrets => {
    if (input.type === WarehouseTypes.DATABRICKS)
        return parseAiServiceAccountSecrets(input);
    const previous =
        saved?.type === input.type &&
        saved.authenticationType === input.authenticationType
            ? saved
            : null;
    return parseAiServiceAccountSecrets({
        ...previous,
        ...Object.fromEntries(
            Object.entries(input).filter(([, value]) => value !== undefined),
        ),
    });
};

export const applyAiServiceAccountCredentials =
    buildAiServiceAccountCredentials;

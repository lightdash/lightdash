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
    if (
        input.type === WarehouseTypes.DATABRICKS ||
        input.type === WarehouseTypes.ATHENA
    )
        return parseAiServiceAccountSecrets(input);
    const previous =
        saved?.type === input.type &&
        saved.authenticationType === input.authenticationType
            ? saved
            : null;
    const merged = {
        ...previous,
        ...Object.fromEntries(
            Object.entries(input).filter(([, value]) => value !== undefined),
        ),
    };
    if ('privateKeyPass' in merged && merged.privateKeyPass === null)
        delete merged.privateKeyPass;
    return parseAiServiceAccountSecrets(merged);
};

export const applyAiServiceAccountCredentials =
    buildAiServiceAccountCredentials;

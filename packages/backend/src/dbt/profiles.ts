import {
    ParameterError,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import * as yaml from 'js-yaml';
import type { DbtTargetResult } from '../services/WarehouseClientFactory/CredentialResolver';
import { toDbtTarget } from './targets';

export const LIGHTDASH_PROFILE_NAME = 'lightdash_profile';
export const LIGHTDASH_TARGET_NAME = 'prod';

export const profileFromTarget = (
    result: DbtTargetResult,
    customTargetName: string | undefined = undefined,
) => {
    if (result.kind === 'none') throw new ParameterError(result.reason);
    const targetName = customTargetName || LIGHTDASH_TARGET_NAME;
    const { target, environment } = result;
    const profile = yaml.dump({
        [LIGHTDASH_PROFILE_NAME]: {
            target: targetName,
            outputs: { [targetName]: target },
        },
    });
    return { profile, environment, files: undefined };
};

export const profileFromCredentials = (
    credentials: CreateWarehouseCredentials,
    _profilesDir: string,
    customTargetName: string | undefined = undefined,
) =>
    profileFromTarget(
        toDbtTarget(credentials, { explicitCredentials: false }),
        customTargetName,
    );

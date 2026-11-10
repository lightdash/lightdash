import {
    ParameterError,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import * as yaml from 'js-yaml';
import * as path from 'path';
import type { DbtTargetResult } from '../services/WarehouseClientFactory/CredentialResolver';
import { toDbtTarget } from './targets';

export const LIGHTDASH_PROFILE_NAME = 'lightdash_profile';
export const LIGHTDASH_TARGET_NAME = 'prod';

export const profileFromTarget = (
    result: DbtTargetResult,
    profilesDir: string,
    customTargetName: string | undefined = undefined,
) => {
    if (result.kind === 'none') throw new ParameterError(result.reason);
    const targetName = customTargetName || LIGHTDASH_TARGET_NAME;
    const { target } = result;
    const files = (result.files ?? []).map(
        ({ name, content, environmentVariable }) => ({
            path: path.join(profilesDir, name),
            content,
            environmentVariable,
        }),
    );
    const environment = {
        ...result.environment,
        ...Object.fromEntries(
            files.map(({ path: filePath, environmentVariable }) => [
                environmentVariable,
                filePath,
            ]),
        ),
    };
    const profile = yaml.dump({
        [LIGHTDASH_PROFILE_NAME]: {
            target: targetName,
            outputs: { [targetName]: target },
        },
    });
    return {
        profile,
        environment,
        files: files.map(({ path: filePath, content }) => ({
            path: filePath,
            content,
        })),
    };
};

export const profileFromCredentials = (
    credentials: CreateWarehouseCredentials,
    profilesDir: string,
    customTargetName: string | undefined = undefined,
) =>
    profileFromTarget(
        toDbtTarget(credentials, { explicitCredentials: false }),
        profilesDir,
        customTargetName,
    );

import { CreateWarehouseCredentials, ParseError } from '@lightdash/common';
import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { convertBigquerySchema } from './targets/bigquery';
import { convertPostgresSchema } from './targets/postgres';
import { convertSnowflakeSchema } from './targets/snowflake';
import { renderProfilesYml } from './templating';
import { LoadProfileArgs, Profiles, Target } from './types';

export const loadDbtTarget = ({
    profilesDir,
    profileName,
    targetName,
}: LoadProfileArgs): Target => {
    const profilePath = path.join(profilesDir, 'profiles.yml');
    let allProfiles;
    try {
        const raw = readFileSync(profilePath, { encoding: 'utf8' });
        const rendered = renderProfilesYml(raw);
        allProfiles = yaml.load(rendered) as Profiles;
    } catch (e) {
        throw new ParseError(
            `Could not find a valid profiles.yml file at ${profilePath}:\n  ${e.message}`,
        );
    }
    const profile = allProfiles[profileName];
    if (!profile) {
        throw new ParseError(
            `Profile ${profileName} not found in ${profilePath}`,
        );
    }
    const selectedTargetName = targetName || profile.target;
    const target = profile.outputs[selectedTargetName];
    if (target === undefined) {
        throw new ParseError(
            `Couldn't find target "${selectedTargetName}" for profile ${profileName} in profiles.yml at ${profilePath}`,
        );
    }
    return target;
};

export const warehouseCredentialsFromDbtTarget = (
    target: Target,
): CreateWarehouseCredentials => {
    switch (target.type) {
        case 'postgres':
            return convertPostgresSchema(target);
        case 'snowflake':
            return convertSnowflakeSchema(target);
        case 'bigquery':
            return convertBigquerySchema(target);
        default:
            throw new ParseError(
                `Sorry! Lightdash doesn't yet support ${target.type} dbt targets`,
            );
    }
};

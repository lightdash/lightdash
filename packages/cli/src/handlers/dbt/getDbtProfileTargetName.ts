import { getErrorMessage, ParseError } from '@lightdash/common';
import execa from 'execa';
import path from 'path';
import { loadDbtTarget } from '../../dbt/profile';
import GlobalState from '../../globalState';

const DBT_CLOUD_TARGET_NAME_REGEX = /Target name\s+(\w+)/;

const getDbtCloudTargetName = async (): Promise<string> => {
    try {
        const { all } = await execa('dbt', ['environment', 'show'], {
            all: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const logs = all || '';
        const targetName = logs.match(DBT_CLOUD_TARGET_NAME_REGEX);
        if (targetName === null || targetName.length === 0) {
            throw new ParseError(
                `Can't locate profile target name in 'dbt environment show' response`,
            );
        }
        return targetName[1];
    } catch (e: unknown) {
        throw new ParseError(
            `Failed to get profile target name:\n  ${getErrorMessage(e)}`,
        );
    }
};

type GetDbtProfileTargetNameOptions = {
    isDbtCloudCLI: boolean;
    profilesDir: string;
    profile: string;
    target?: string;
};

export default async function getDbtProfileTargetName(
    options: GetDbtProfileTargetNameOptions,
): Promise<string> {
    let targetName;
    if (options.isDbtCloudCLI) {
        targetName = await getDbtCloudTargetName();
    } else {
        const absoluteProfilesPath = path.resolve(options.profilesDir);
        GlobalState.debug(
            `> Using profiles dir ${absoluteProfilesPath} and profile ${options.profile}`,
        );
        const { name } = await loadDbtTarget({
            profilesDir: absoluteProfilesPath,
            profileName: options.profile,
            targetName: options.target,
        });
        targetName = name;
    }
    return targetName;
}

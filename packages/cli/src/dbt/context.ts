import { getErrorMessage, ParseError } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import GlobalState from '../globalState';
import { renderTemplatedYml } from './templating';

type GetDbtContextArgs = {
    projectDir: string;
    initialProjectDir?: string;
    targetPath?: string;
};
export type DbtContext = {
    projectName: string;
    profileName: string;
    targetDir: string;
    modelsDir: string;
};

function tryRenderVariable(variableName: string, raw: string): string {
    try {
        return renderTemplatedYml(raw);
    } catch (e) {
        GlobalState.debug(
            `> Warning: Failed to render Jinja in dbt_project.yml ${variableName}: ${getErrorMessage(
                e,
            )}`,
        );
        GlobalState.debug(
            '> Falling back to parsing raw YAML without Jinja rendering',
        );
        return raw;
    }
}

export const getDbtContext = async ({
    projectDir,
    initialProjectDir,
    targetPath,
}: GetDbtContextArgs): Promise<DbtContext> => {
    GlobalState.debug(`> Loading dbt_project.yml file from: ${projectDir}`);

    const projectFilename = path.join(projectDir, 'dbt_project.yml');
    let file;

    try {
        file = await fs.readFile(projectFilename, { encoding: 'utf-8' });
    } catch (e: unknown) {
        if (projectDir !== path.parse(projectDir).root) {
            const parentDir = path.join(projectDir, '..');
            return await getDbtContext({
                projectDir: parentDir,
                initialProjectDir: initialProjectDir || projectDir,
                targetPath,
            });
        }

        const msg = getErrorMessage(e);
        throw new ParseError(
            `Is ${initialProjectDir} a valid dbt project directory? Couldn't find a valid dbt_project.yml on ${initialProjectDir} or any of its parents:\n  ${msg}`,
        );
    }

    const config = yaml.load(file) as Record<string, string>;

    // Try to render Jinja templating (e.g., env_var) for each individual config key needed
    let targetSubDir: string;

    // Precedence: CLI option > env var > dbt_project.yml > default
    if (targetPath) {
        targetSubDir = targetPath;
        GlobalState.debug(
            `> Using target-path from CLI option: ${targetSubDir}`,
        );
    } else if (process.env.DBT_TARGET_PATH) {
        targetSubDir = process.env.DBT_TARGET_PATH;
        GlobalState.debug(
            `> Using target-path from DBT_TARGET_PATH env var: ${targetSubDir}`,
        );
    } else {
        targetSubDir = config['target-path'] || './target';
        targetSubDir = tryRenderVariable('target-path', targetSubDir);
        GlobalState.debug(
            `> Using target-path from dbt_project.yml: ${targetSubDir}`,
        );
    }

    let modelsSubDir = config['models-path'] || './models';
    let projectName = config.name;
    let profileName = config.profile;

    // ! Important: We only render the variables that are needed for the context, other variables are not rendered to avoid unexpected behavior.
    modelsSubDir = tryRenderVariable('models-path', modelsSubDir);
    projectName = tryRenderVariable('name', projectName);
    profileName = tryRenderVariable('profile', profileName);

    GlobalState.debug(`> dbt target directory: ${targetSubDir}`);

    const targetDir = path.isAbsolute(targetSubDir)
        ? targetSubDir
        : path.join(projectDir, targetSubDir);
    const modelsDir = path.join(projectDir, modelsSubDir);
    return {
        projectName,
        profileName,
        targetDir,
        modelsDir,
    };
};

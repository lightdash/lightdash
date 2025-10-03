import { getErrorMessage, ParseError } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import GlobalState from '../globalState';
import { renderTemplatedYml } from './templating';

type GetDbtContextArgs = {
    projectDir: string;
    initialProjectDir?: string;
};
export type DbtContext = {
    projectName: string;
    profileName: string;
    targetDir: string;
    modelsDir: string;
};

export const getDbtContext = async ({
    projectDir,
    initialProjectDir,
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
            });
        }

        const msg = getErrorMessage(e);
        throw new ParseError(
            `Is ${initialProjectDir} a valid dbt project directory? Couldn't find a valid dbt_project.yml on ${initialProjectDir} or any of its parents:\n  ${msg}`,
        );
    }
    // Try to render Jinja templating (e.g., env_var) before parsing YAML
    // If rendering fails, fall back to parsing the raw file for back compat
    let renderedFile: string;
    try {
        renderedFile = renderTemplatedYml(file);
    } catch (e) {
        GlobalState.debug(
            `> Warning: Failed to render Jinja in dbt_project.yml: ${getErrorMessage(
                e,
            )}`,
        );
        GlobalState.debug(
            '> Falling back to parsing raw YAML without Jinja rendering',
        );
        renderedFile = file;
    }
    const config = yaml.load(renderedFile) as Record<string, string>;

    const targetSubDir = config['target-path'] || './target';

    GlobalState.debug(`> dbt target directory: ${targetSubDir}`);

    const targetDir = path.join(projectDir, targetSubDir);
    const modelsSubDir = config['models-path'] || './models';
    const modelsDir = path.join(projectDir, modelsSubDir);
    return {
        projectName: config.name,
        profileName: config.profile,
        targetDir,
        modelsDir,
    };
};

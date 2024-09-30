import { ParseError } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import GlobalState from '../globalState';

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

        const msg = e instanceof Error ? e.message : '-';
        throw new ParseError(
            `Is ${initialProjectDir} a valid dbt project directory? Couldn't find a valid dbt_project.yml on ${initialProjectDir} or any of its parents:\n  ${msg}`,
        );
    }
    const config = yaml.load(file) as Record<string, string>;

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

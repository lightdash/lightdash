import { ParseError } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

type GetDbtContextArgs = {
    projectDir: string;
    initialProjectDir?: string;
    verbose?: boolean;
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
    verbose,
}: GetDbtContextArgs): Promise<DbtContext> => {
    if (verbose)
        console.error(`> Loading dbt_project.yml file from: ${projectDir}`);
    const projectFilename = path.join(projectDir, 'dbt_project.yml');
    let file;

    try {
        file = await fs.readFile(projectFilename, { encoding: 'utf-8' });
    } catch (e: any) {
        if (projectDir !== path.parse(projectDir).root) {
            const parentDir = path.join(projectDir, '..');
            return await getDbtContext({
                projectDir: parentDir,
                initialProjectDir: initialProjectDir || projectDir,
            });
        }

        throw new ParseError(
            `Is ${initialProjectDir} a valid dbt project directory? Couldn't find a valid dbt_project.yml on ${initialProjectDir} or any of its parents:\n  ${e.message}`,
        );
    }
    const config = yaml.load(file) as any;

    const targetSubDir = config['target-path'] || './target';
    if (verbose) console.error(`> DBT target directory: ${targetSubDir}`);

    const targetDir = path.join(projectDir, targetSubDir);
    const modelsSubDir = config['models-path'] || './models';
    const modelsDir = path.join(projectDir, modelsSubDir);
    return {
        projectName: config.name as string,
        profileName: config.profile as string,
        targetDir,
        modelsDir,
    };
};

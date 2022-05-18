import { ParseError } from '@lightdash/common';
import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

type GetDbtContextArgs = {
    projectDir: string;
};
type DbtContext = {
    projectName: string;
    profileName: string;
    targetDir: string;
    modelsDir: string;
};

export const getDbtContext = ({
    projectDir,
}: GetDbtContextArgs): DbtContext => {
    const projectFilename = path.join(projectDir, 'dbt_project.yml');
    let config;
    try {
        config = yaml.load(
            readFileSync(projectFilename, { encoding: 'utf-8' }),
        ) as any;
    } catch (e) {
        throw new ParseError(
            `Is ${projectDir} a valid dbt project? Couldn't find a valid dbt_project.yml file at ${projectFilename}:\n  ${e.message}`,
        );
    }
    const targetSubDir = config['target-path'] || './target';
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

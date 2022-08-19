import { Project } from '@lightdash/common';
import inquirer from 'inquirer';
import PressToContinuePrompt from 'inquirer-press-to-continue';
import ora from 'ora';
import {
    adjectives,
    animals,
    uniqueNamesGenerator,
} from 'unique-names-generator';
import { URL } from 'url';
import { getConfig } from '../config';
import { createProject } from './createProject';
import { lightdashApi } from './dbt/apiClient';
import { DbtCompileOptions } from './dbt/compile';
import { deploy } from './deploy';

inquirer.registerPrompt('press-to-continue', PressToContinuePrompt);

type PreviewHandlerOptions = DbtCompileOptions & {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
};

export const previewHandler = async (
    options: PreviewHandlerOptions,
): Promise<void> => {
    const name = uniqueNamesGenerator({
        length: 2,
        separator: ' ',
        dictionaries: [adjectives, animals],
    });
    const config = await getConfig();
    console.error('');
    const spinner = ora(`  Setting up preview environment`).start();
    let project: Project;
    try {
        project = await createProject({ ...options, name });
    } catch (e: any) {
        spinner.fail();
        throw e;
    }
    try {
        const projectUrl =
            config.context?.serverUrl &&
            new URL(
                `/projects/${project.projectUuid}/tables`,
                config.context.serverUrl,
            );
        await deploy({ ...options, projectUuid: project.projectUuid });
        spinner.succeed(
            `  Developer preview "${name}" ready at: ${projectUrl}\n`,
        );
        await inquirer.prompt({
            type: 'press-to-continue',
            name: 'key',
            anyKey: true,
            pressToContinueMessage: 'Press any key to shutdown preview',
        });
    } catch (e: any) {
        spinner.fail('Error creating developer preview');
        await lightdashApi({
            method: 'DELETE',
            url: `/api/v1/org/projects/${project.projectUuid}`,
            body: undefined,
        });
        throw e;
    }
    const teardownSpinner = ora(`  Cleaning up`).start();
    await lightdashApi({
        method: 'DELETE',
        url: `/api/v1/org/projects/${project.projectUuid}`,
        body: undefined,
    });
    teardownSpinner.succeed(`  Cleaned up`);
};

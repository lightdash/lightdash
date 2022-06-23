import inquirer from 'inquirer';
import PressToContinuePrompt from 'inquirer-press-to-continue';
import {
    adjectives,
    animals,
    uniqueNamesGenerator,
} from 'unique-names-generator';
import { URL } from 'url';
import { getConfig } from '../config';
import { createProject } from './createProject';
import { lightdashApi } from './dbt/apiClient';
import { deploy } from './deploy';

inquirer.registerPrompt('press-to-continue', PressToContinuePrompt);

type PreviewHandlerOptions = {
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
    const project = await createProject({ ...options, name });
    const config = await getConfig();
    const projectUrl =
        config.context?.serverUrl &&
        new URL(
            `/projects/${project.projectUuid}/tables`,
            config.context.serverUrl,
        );
    await deploy({ ...options, projectUuid: project.projectUuid });
    console.error(`\n  ⚙️  Developer preview ready at: ${projectUrl}\n`);
    await inquirer.prompt({
        type: 'press-to-continue',
        name: 'key',
        anyKey: true,
        pressToContinueMessage: 'Press any key to shutdown preview',
    });
    await lightdashApi({
        method: 'DELETE',
        url: `/api/v1/org/projects/${project.projectUuid}`,
        body: undefined,
    });
};

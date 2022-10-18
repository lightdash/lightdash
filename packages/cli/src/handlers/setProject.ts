import { OrganizationProject } from '@lightdash/common';
import inquirer from 'inquirer';
import { URL } from 'url';
import { getConfig, setProjectUuid } from '../config';
import { lightdashApi } from './dbt/apiClient';

type SetProjectOptions = {
    verbose: boolean;
};

export const setProjectInteractively = async (options: SetProjectOptions) => {
    const projects = await lightdashApi<OrganizationProject[]>({
        method: 'GET',
        url: `/api/v1/org/projects`,
        body: undefined,
        verbose: options.verbose,
    });
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'project',
            choices: (projects || []).map((project) => ({
                name: project.name,
                value: project.projectUuid,
            })),
        },
    ]);
    await setProjectUuid(answers.project);
    const config = await getConfig();
    const projectUrl =
        config.context?.serverUrl &&
        new URL(`/projects/${answers.project}/home`, config.context.serverUrl);
    console.error(
        `\n  ✅️ Connected to Lightdash project: ${projectUrl || ''}\n`,
    );
};

export const setFirstProject = async (options: SetProjectOptions) => {
    const projects = await lightdashApi<OrganizationProject[]>({
        method: 'GET',
        url: `/api/v1/org/projects`,
        body: undefined,
        verbose: options.verbose,
    });
    const firstProject = projects[0];

    await setProjectUuid(firstProject.projectUuid);
    const config = await getConfig();
    const projectUrl =
        config.context?.serverUrl &&
        new URL(
            `/projects/${firstProject.name}/home`,
            config.context.serverUrl,
        );
    console.error(
        `\n  ✅️ Connected to Lightdash project: ${projectUrl || ''}\n`,
    );
};

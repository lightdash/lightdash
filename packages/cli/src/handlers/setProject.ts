import { OrganizationProject } from '@lightdash/common';
import inquirer from 'inquirer';
import { URL } from 'url';
import { getConfig, setProject } from '../config';
import GlobalState from '../globalState';
import { lightdashApi } from './dbt/apiClient';

type SetProjectOptions = {
    verbose: boolean;
    name: string;
    uuid: string;
};

export const setProjectCommand = async (name?: string, uuid?: string) => {
    const projects = await lightdashApi<OrganizationProject[]>({
        method: 'GET',
        url: `/api/v1/org/projects`,
        body: undefined,
    });

    GlobalState.debug(
        `> Set project returned response: ${JSON.stringify(projects)}`,
    );

    if (projects.length === 0) return;

    let selectedProject: OrganizationProject | undefined;

    // --uuid or --name options
    if (uuid !== undefined || name !== undefined) {
        selectedProject = projects.find(
            (project) => project.name === name || project.projectUuid === uuid,
        );

        // Select project interactively
    } else {
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'project',
                choices: projects.map((project) => ({
                    name: project.name,
                    value: project.projectUuid,
                })),
            },
        ]);

        selectedProject = projects.find(
            (project) => project.projectUuid === answers.project,
        );
    }

    if (selectedProject !== undefined) {
        await setProject(selectedProject.projectUuid, selectedProject.name);
        const config = await getConfig();
        const projectUrl =
            config.context?.serverUrl &&
            new URL(
                `/projects/${selectedProject.projectUuid}/home`,
                config.context.serverUrl,
            );
        console.error(`\n  ✅️ Connected to project: ${projectUrl || ''}\n`);
    } else {
        throw new Error(`Project not found.`);
    }
};

export const setFirstProject = async () => {
    const projects = await lightdashApi<OrganizationProject[]>({
        method: 'GET',
        url: `/api/v1/org/projects`,
        body: undefined,
    });
    const firstProject = projects[0];

    await setProject(firstProject.projectUuid, firstProject.name);
    const config = await getConfig();
    const projectUrl =
        config.context?.serverUrl &&
        new URL(
            `/projects/${firstProject.name}/home`,
            config.context.serverUrl,
        );
    console.error(`\n  ✅️ Connected to project: ${projectUrl || ''}\n`);
};

export const setProjectHandler = async (options: SetProjectOptions) => {
    GlobalState.setVerbose(options.verbose);
    return setProjectCommand(options.name, options.uuid);
};

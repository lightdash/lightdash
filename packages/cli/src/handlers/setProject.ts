import inquirer from 'inquirer';
import { URL } from 'url';
import { getConfig, setConfig } from '../config';
import { lightdashApi } from './dbt/apiClient';

export const setProject = async () => {
    const projects = await lightdashApi<
        { projectUuid: string; name: string }[]
    >({
        method: 'GET',
        url: `/api/v1/org/projects`,
        body: undefined,
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
    const config = await getConfig(false);
    await setConfig({
        ...config,
        context: { ...config.context, project: answers.project },
    });
    const projectUrl =
        config.context?.serverUrl &&
        new URL(`/projects/${answers.project}/home`, config.context.serverUrl);
    console.error(
        `\n  ✅️ Connected to Lightdash project: ${projectUrl || ''}\n`,
    );
};

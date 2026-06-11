import { OrganizationProject, ProjectType } from '@lightdash/common';
import inquirer from 'inquirer';
import { URL } from 'url';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig, setProject, unsetProject } from '../config';
import GlobalState from '../globalState';
import { lightdashApi } from './dbt/apiClient';

type SetProjectOptions = {
    verbose: boolean;
    name: string;
    uuid: string;
};

export const setProjectCommand = async (
    name?: string,
    uuid?: string,
): Promise<'selected' | 'skipped' | 'empty'> => {
    const projects = await lightdashApi<OrganizationProject[]>({
        method: 'GET',
        url: `/api/v1/org/projects`,
        body: undefined,
    });

    GlobalState.debug(
        `> Set project returned response: ${JSON.stringify(projects)}`,
    );

    // `set-project` configures the default (production) project. Preview
    // projects are managed separately via `start-preview`/`stop-preview`,
    // and storing one here causes the download prompt to show the same
    // project under both "Preview" and "Production" labels.
    const nonPreviewProjects = projects.filter(
        (project) => project.type !== ProjectType.PREVIEW,
    );

    if (projects.length === 0) return 'empty';

    let selectedProject: OrganizationProject | undefined;

    // --uuid or --name options
    if (uuid !== undefined || name !== undefined) {
        const matchedProject = projects.find(
            (project) => project.name === name || project.projectUuid === uuid,
        );
        if (matchedProject?.type === ProjectType.PREVIEW) {
            throw new Error(
                `Project "${matchedProject.name}" is a preview project and cannot be set as the default project. Use \`lightdash start-preview\` to work with preview projects.`,
            );
        }
        selectedProject = matchedProject;
    } else if (GlobalState.isNonInteractive()) {
        GlobalState.debug('> Non-interactive mode: selecting first project');
        [selectedProject] = nonPreviewProjects;
    } else {
        const SKIP_VALUE = '__skip__';
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'project',
                choices: [
                    {
                        name: "Don't select a project",
                        value: SKIP_VALUE,
                    },
                    ...nonPreviewProjects.map((project) => ({
                        name: project.name,
                        value: project.projectUuid,
                    })),
                ],
            },
        ]);

        if (answers.project === SKIP_VALUE) {
            await unsetProject();
            return 'skipped';
        }

        selectedProject = nonPreviewProjects.find(
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
        console.error(
            `\n  ✅️ Connected to Lightdash project: ${projectUrl || ''}\n`,
        );
        return 'selected';
    }
    throw new Error(`Project not found.`);
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
    console.error(
        `\n  ✅️ Connected to Lightdash project: ${projectUrl || ''}\n`,
    );
};

export const setProjectHandler = async (options: SetProjectOptions) => {
    const startTime = Date.now();
    let success = true;
    GlobalState.setVerbose(options.verbose);
    try {
        const result = await setProjectCommand(options.name, options.uuid);
        if (result === 'skipped') {
            console.error(`\n  Project unset.\n`);
        }
    } catch (e) {
        success = false;
        throw e;
    } finally {
        await LightdashAnalytics.track({
            event: 'command.executed',
            properties: {
                command: 'set-project',
                durationMs: Date.now() - startTime,
                success,
            },
        });
    }
};

export const unsetProjectCommand = async () => {
    await unsetProject();
    console.error(`\n  Project unset.\n`);
};

export const unsetProjectHandler = async (options: { verbose: boolean }) => {
    const startTime = Date.now();
    let success = true;
    GlobalState.setVerbose(options.verbose);
    try {
        await unsetProjectCommand();
    } catch (e) {
        success = false;
        throw e;
    } finally {
        await LightdashAnalytics.track({
            event: 'command.executed',
            properties: {
                command: 'unset-project',
                durationMs: Date.now() - startTime,
                success,
            },
        });
    }
};

import { LightdashError, Project, ProjectType } from '@lightdash/common';
import inquirer from 'inquirer';
import { Config, unsetPreviewProject } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';

export type ProjectSelection = {
    projectUuid: string;
    isPreview: boolean;
};

const validatePreviewProject = async (
    previewProjectUuid: string | undefined,
): Promise<string | undefined> => {
    if (!previewProjectUuid) {
        return undefined;
    }

    try {
        const project = await lightdashApi<Project>({
            method: 'GET',
            url: `/api/v1/projects/${previewProjectUuid}`,
            body: undefined,
        });

        if (project.type === ProjectType.PREVIEW) {
            return project.projectUuid;
        }

        await unsetPreviewProject();
        return undefined;
    } catch (error) {
        if (
            error instanceof LightdashError &&
            (error.statusCode === 403 || error.statusCode === 404)
        ) {
            await unsetPreviewProject();
            return undefined;
        }

        return previewProjectUuid;
    }
};

/**
 * Resolves which project to use, prompting the user if there's an active preview.
 *
 * Priority:
 * 1. If `explicitProject` is provided (via --project flag), use it
 * 2. If there's an active preview and we're in interactive mode, ask the user
 * 3. In non-interactive mode with active preview, use preview project
 * 4. Fall back to the main project
 */
export const selectProject = async (
    config: Config,
    explicitProject?: string,
): Promise<ProjectSelection | undefined> => {
    // If explicit project provided via --project flag, use it
    if (explicitProject) {
        return { projectUuid: explicitProject, isPreview: false };
    }

    const mainProject = config.context?.project;
    const previewProject = await validatePreviewProject(
        config.context?.previewProject,
    );
    const previewName = config.context?.previewName;
    const mainProjectName = config.context?.projectName;

    // No projects configured at all
    if (!mainProject && !previewProject) {
        return undefined;
    }

    // Only preview project available (edge case, but handle it)
    if (!mainProject && previewProject) {
        return { projectUuid: previewProject, isPreview: true };
    }

    // Only main project available (no active preview)
    if (mainProject && !previewProject) {
        return { projectUuid: mainProject, isPreview: false };
    }

    // If the stored main project is the same UUID as the preview project,
    // the config was set up incorrectly (e.g. an older `set-project` allowed
    // selecting a preview). Treat the project as a preview only — otherwise
    // the prompt would show the same project under both labels.
    if (mainProject && previewProject && mainProject === previewProject) {
        return { projectUuid: previewProject, isPreview: true };
    }

    // Both are available - need to choose
    if (mainProject && previewProject) {
        // In non-interactive mode, default to preview project
        if (GlobalState.isNonInteractive()) {
            GlobalState.debug(
                '> Non-interactive mode with active preview, using preview project',
            );
            return { projectUuid: previewProject, isPreview: true };
        }

        // Interactive mode - ask the user
        const spinner = GlobalState.getActiveSpinner();
        spinner?.stop();

        const previewLabel = previewName
            ? `Preview: "${previewName}"`
            : `Preview: ${previewProject}`;
        const mainLabel = mainProjectName
            ? `Production: "${mainProjectName}"`
            : `Production: ${mainProject}`;

        const { selectedProject } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedProject',
                message:
                    'You have an active preview. Which project do you want to use?',
                choices: [
                    { name: previewLabel, value: 'preview' },
                    { name: mainLabel, value: 'production' },
                ],
                default: 'preview',
            },
        ]);

        spinner?.start();

        if (selectedProject === 'preview') {
            return { projectUuid: previewProject, isPreview: true };
        }
        return { projectUuid: mainProject, isPreview: false };
    }

    return undefined;
};

/**
 * Logs which project is being used
 */
export const logSelectedProject = (
    selection: ProjectSelection,
    config: Config,
    action: string,
): void => {
    const { projectUuid, isPreview } = selection;
    const previewName = config.context?.previewName;
    const mainProjectName = config.context?.projectName;
    const mainProjectUuid = config.context?.project;

    if (isPreview) {
        const name = previewName ? `"${previewName}"` : projectUuid;
        GlobalState.log(
            `\n${styles.success(`${action} preview project:`)} ${name}\n`,
        );
    } else {
        // Only use the cached project name when the selection actually points
        // at the config-set project. With --project, the UUID can differ and
        // the cached name would be misleading.
        const isConfigProject = mainProjectUuid === projectUuid;
        const name =
            isConfigProject && mainProjectName
                ? `"${mainProjectName}"`
                : projectUuid;
        GlobalState.log(`\n${styles.success(`${action} project:`)} ${name}\n`);
    }
};

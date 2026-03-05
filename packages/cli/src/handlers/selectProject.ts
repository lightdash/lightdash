import inquirer from 'inquirer';
import { Config } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';

export type ProjectSelection = {
    projectUuid: string;
    isPreview: boolean;
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
    const previewProject = config.context?.previewProject;
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

    if (isPreview) {
        const name = previewName ? `"${previewName}"` : projectUuid;
        GlobalState.log(
            `\n${styles.success(`${action} preview project:`)} ${name}\n`,
        );
    } else {
        const name = mainProjectName ? `"${mainProjectName}"` : projectUuid;
        GlobalState.log(`\n${styles.success(`${action} project:`)} ${name}\n`);
    }
};

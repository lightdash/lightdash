import {
    ApiAppSummary,
    ApiGenerateAppResponse,
    ApiGetAppResponse,
    ApiMyAppsResponse,
    AppVersionStatus,
    isAppVersionInProgress,
} from '@lightdash/common';
import inquirer from 'inquirer';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';

type AppOptions = {
    resume?: string | boolean;
    verbose?: boolean;
};

type ProjectContext = {
    projectUuid: string;
    serverUrl: string;
};

const POLL_INTERVAL_MS = 2000;

const requireProjectContext = async (): Promise<ProjectContext> => {
    const config = await getConfig();
    const projectUuid = config.context?.project;
    const serverUrl = config.context?.serverUrl;
    if (!projectUuid) {
        throw new Error(
            `No project selected. Run 'lightdash config set-project' first.`,
        );
    }
    if (!serverUrl) {
        throw new Error(`Not logged in. Run 'lightdash login --help'.`);
    }
    return { projectUuid, serverUrl };
};

const generateApp = async (
    projectUuid: string,
    prompt: string,
): Promise<{ appUuid: string; version: number }> => {
    const result = await lightdashApi<ApiGenerateAppResponse['results']>({
        method: 'POST',
        url: `/api/v1/ee/projects/${projectUuid}/apps/`,
        body: JSON.stringify({ prompt }),
    });
    return result;
};

const iterateApp = async (
    projectUuid: string,
    appUuid: string,
    prompt: string,
): Promise<{ appUuid: string; version: number }> => {
    const result = await lightdashApi<ApiGenerateAppResponse['results']>({
        method: 'POST',
        url: `/api/v1/ee/projects/${projectUuid}/apps/${appUuid}/versions`,
        body: JSON.stringify({ prompt }),
    });
    return result;
};

const getApp = async (
    projectUuid: string,
    appUuid: string,
): Promise<ApiGetAppResponse['results']> =>
    lightdashApi<ApiGetAppResponse['results']>({
        method: 'GET',
        url: `/api/v1/ee/projects/${projectUuid}/apps/${appUuid}`,
        body: undefined,
    });

const cancelVersion = async (
    projectUuid: string,
    appUuid: string,
    version: number,
): Promise<void> => {
    await lightdashApi<undefined>({
        method: 'POST',
        url: `/api/v1/ee/projects/${projectUuid}/apps/${appUuid}/versions/${version}/cancel`,
        body: undefined,
    });
};

const listMyApps = async (): Promise<ApiAppSummary[]> => {
    const result = await lightdashApi<ApiMyAppsResponse['results']>({
        method: 'GET',
        url: `/api/v1/ee/user/apps?page=1&pageSize=100`,
        body: undefined,
    });
    return result.data;
};

const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

/**
 * Poll the app until the given version reaches a terminal status. Installs a
 * SIGINT handler that cancels the building version server-side so we don't
 * leave a zombie sandbox running when the user hits Ctrl+C.
 */
const pollBuild = async (
    projectUuid: string,
    appUuid: string,
    version: number,
): Promise<{ status: AppVersionStatus; error: string | null }> => {
    const spinner = GlobalState.startSpinner('Starting build...');

    let cancelled = false;
    const onSigint = () => {
        cancelled = true;
        spinner.warn('Cancelling build...');
        cancelVersion(projectUuid, appUuid, version)
            .catch((err) => {
                GlobalState.debug(`Failed to cancel version: ${err}`);
            })
            .finally(() => {
                process.exit(130);
            });
    };
    process.on('SIGINT', onSigint);

    try {
        while (!cancelled) {
            // eslint-disable-next-line no-await-in-loop
            const app = await getApp(projectUuid, appUuid);
            const target = app.versions.find((v) => v.version === version);
            if (!target) {
                spinner.fail(`Version ${version} not found`);
                throw new Error(`Version ${version} not found on app`);
            }

            spinner.text =
                target.statusMessage ?? `Building (${target.status})...`;

            if (!isAppVersionInProgress(target.status)) {
                if (target.status === 'ready') {
                    spinner.succeed('Build ready');
                } else {
                    spinner.fail(`Build failed: ${target.status}`);
                }
                return { status: target.status, error: null };
            }

            // eslint-disable-next-line no-await-in-loop
            await sleep(POLL_INTERVAL_MS);
        }
        return { status: 'error', error: 'Cancelled' };
    } finally {
        process.off('SIGINT', onSigint);
    }
};

const askPrompt = async (placeholder: string): Promise<string | null> => {
    if (GlobalState.isNonInteractive()) {
        throw new Error(
            'lightdash app requires an interactive terminal. Run without --non-interactive.',
        );
    }
    const { prompt } = await inquirer.prompt<{ prompt: string }>([
        {
            type: 'input',
            name: 'prompt',
            message: placeholder,
        },
    ]);
    const trimmed = prompt.trim();
    return trimmed.length === 0 ? null : trimmed;
};

const pickAppFromList = async (projectUuid: string): Promise<string | null> => {
    const all = await listMyApps();
    const scoped = all.filter((a) => a.projectUuid === projectUuid);
    if (scoped.length === 0) {
        console.error(
            styles.warning(
                'No apps found for the current project. Run `lightdash app` to create one.',
            ),
        );
        return null;
    }
    const { appUuid } = await inquirer.prompt<{ appUuid: string }>([
        {
            type: 'list',
            name: 'appUuid',
            message: 'Pick an app to resume:',
            pageSize: 15,
            choices: scoped.map((a) => ({
                name: `${a.name || `Untitled app ${a.appUuid.slice(0, 8)}`}${
                    a.lastVersionStatus
                        ? styles.secondary(` (${a.lastVersionStatus})`)
                        : ''
                }`,
                value: a.appUuid,
            })),
        },
    ]);
    return appUuid;
};

const printHistory = (app: ApiGetAppResponse['results']): void => {
    console.error(styles.bold(`\n${app.name}`));
    if (app.description) {
        console.error(styles.secondary(app.description));
    }
    const ordered = [...app.versions].sort((a, b) => a.version - b.version);
    for (const v of ordered) {
        const summary =
            v.prompt.length > 100 ? `${v.prompt.slice(0, 97)}...` : v.prompt;
        console.error(`  ${styles.bold(`v${v.version}`)} ${summary}`);
    }
    console.error('');
};

const printPreviewUrl = (
    serverUrl: string,
    projectUuid: string,
    appUuid: string,
): void => {
    const url = new URL(
        `/projects/${projectUuid}/apps/${appUuid}/preview`,
        serverUrl,
    );
    console.error(`\n${styles.success('Preview ready:')} ${url.href}\n`);
};

/**
 * Run the interactive chat loop. `currentAppUuid` starts as null for a brand
 * new app — the first iteration creates it via POST /apps/ and from then on
 * follow-ups go through POST /apps/{uuid}/versions.
 */
const runChatLoop = async (
    { projectUuid, serverUrl }: ProjectContext,
    initialAppUuid: string | null,
): Promise<void> => {
    let currentAppUuid: string | null = initialAppUuid;

    for (;;) {
        const placeholder =
            currentAppUuid === null
                ? 'Describe your app'
                : 'Iterate on your app (empty to exit)';
        // eslint-disable-next-line no-await-in-loop
        const promptText = await askPrompt(placeholder);
        if (promptText === null) {
            return;
        }

        let response: { appUuid: string; version: number };
        if (currentAppUuid === null) {
            // eslint-disable-next-line no-await-in-loop
            response = await generateApp(projectUuid, promptText);
            currentAppUuid = response.appUuid;
            console.error(styles.secondary(`App created: ${currentAppUuid}\n`));
        } else {
            // eslint-disable-next-line no-await-in-loop
            response = await iterateApp(
                projectUuid,
                currentAppUuid,
                promptText,
            );
        }

        // eslint-disable-next-line no-await-in-loop
        const result = await pollBuild(
            projectUuid,
            currentAppUuid,
            response.version,
        );

        if (result.status === 'ready') {
            printPreviewUrl(serverUrl, projectUuid, currentAppUuid);
        }
        // Either way, loop back so the user can iterate / retry.
    }
};

export const appHandler = async (options: AppOptions): Promise<void> => {
    const startTime = Date.now();
    let success = true;
    GlobalState.setVerbose(options.verbose ?? false);

    try {
        const context = await requireProjectContext();

        let initialAppUuid: string | null = null;

        if (typeof options.resume === 'string') {
            initialAppUuid = options.resume;
        } else if (options.resume === true) {
            initialAppUuid = await pickAppFromList(context.projectUuid);
            if (initialAppUuid === null) {
                return;
            }
        }

        if (initialAppUuid !== null) {
            const app = await getApp(context.projectUuid, initialAppUuid);
            printHistory(app);
        }

        await runChatLoop(context, initialAppUuid);
    } catch (e) {
        success = false;
        throw e;
    } finally {
        await LightdashAnalytics.track({
            event: 'command.executed',
            properties: {
                command: 'app',
                durationMs: Date.now() - startTime,
                success,
            },
        });
    }
};

import {
    APP_VERSION_TERMINAL_STATUSES,
    AuthorizationError,
    LightdashError,
    type ApiGetAppResponse,
    type ApiImportAppCodeResponse,
    type DataAppCode,
    type ImportAppCodeRequestBody,
} from '@lightdash/common';
import { getConfig } from '../../config';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { lightdashApi } from '../dbt/apiClient';
import { selectProject } from '../selectProject';
import { readBundleFromDir } from './appCodeFiles';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

export const isTerminalStatus = (
    status: string,
): status is (typeof APP_VERSION_TERMINAL_STATUSES)[number] =>
    (APP_VERSION_TERMINAL_STATUSES as readonly string[]).includes(status);

export const buildImportBody = (
    code: DataAppCode,
    targetProjectUuid: string,
    opts: { app?: string; space?: string },
): ImportAppCodeRequestBody => {
    let targetAppUuid: string | undefined;
    if (opts.app) {
        targetAppUuid = opts.app;
    } else if (targetProjectUuid === code.manifest.projectUuid) {
        targetAppUuid = code.manifest.appUuid;
    }

    return {
        code,
        targetAppUuid,
        spaceUuid: opts.space,
    };
};

export type AppsUploadHandlerOptions = {
    verbose: boolean;
    project?: string;
    app?: string;
    space?: string;
};

export const appsUploadHandler = async (
    dir: string,
    options: AppsUploadHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);

    const config = await getConfig();
    if (!config.context?.apiKey || !config.context.serverUrl) {
        throw new AuthorizationError(
            `Not logged in. Run 'lightdash login --help'`,
        );
    }
    const { serverUrl } = config.context;

    const projectSelection = await selectProject(config, options.project);
    if (!projectSelection) {
        throw new LightdashError({
            message: 'No project selected. Run lightdash config set-project',
            name: 'Not Found',
            statusCode: 404,
            data: {},
        });
    }
    const { projectUuid } = projectSelection;

    const spinner = GlobalState.startSpinner('Uploading source…');

    try {
        const code = await readBundleFromDir(dir);
        const body = buildImportBody(code, projectUuid, options);

        const { appUuid, version, action } = await lightdashApi<
            ApiImportAppCodeResponse['results']
        >({
            method: 'POST',
            url: `/api/v1/ee/projects/${projectUuid}/apps/code`,
            body: JSON.stringify(body),
        });

        spinner.text = `Building app (v${version})…`;

        const pollUntilDone = async (deadline: number): Promise<void> => {
            if (Date.now() >= deadline) {
                spinner.fail('Build timed out after 10 minutes');
                throw new LightdashError({
                    message: 'Build timed out after 10 minutes',
                    name: 'Timeout',
                    statusCode: 504,
                    data: {},
                });
            }

            await sleep(POLL_INTERVAL_MS);

            const app = await lightdashApi<ApiGetAppResponse['results']>({
                method: 'GET',
                url: `/api/v1/ee/projects/${projectUuid}/apps/${appUuid}`,
                body: undefined,
            });

            const v = app.versions.find((x) => x.version === version);
            if (!v) {
                throw new LightdashError({
                    message: `Version ${version} not found in app ${appUuid} response`,
                    name: 'Not Found',
                    statusCode: 404,
                    data: {},
                });
            }

            if (v.statusMessage) {
                spinner.text = `Building app (v${version}): ${v.statusMessage}`;
            }

            if (isTerminalStatus(v.status)) {
                if (v.status === 'ready') {
                    const actionLabel =
                        action === 'create' ? 'created' : 'updated';
                    spinner.succeed(
                        `App ${actionLabel}: v${version} built (${appUuid})`,
                    );
                    GlobalState.log(
                        styles.info(`View at: ${serverUrl}/apps/${appUuid}`),
                    );
                    return;
                }
                // error terminal status
                spinner.fail(`Build failed for v${version}`);
                const errorDetail = v.statusMessage ?? 'Unknown build error';
                GlobalState.log(styles.error(errorDetail));
                throw new LightdashError({
                    message: errorDetail,
                    name: 'Build Error',
                    statusCode: 500,
                    data: {},
                });
            }

            await pollUntilDone(deadline);
        };

        await pollUntilDone(Date.now() + POLL_TIMEOUT_MS);
    } catch (err) {
        if (spinner.isSpinning) {
            spinner.fail('Upload failed');
        }
        if (err instanceof LightdashError && err.statusCode === 404) {
            GlobalState.log(
                styles.error(
                    `App not found or data apps are not enabled on this instance.`,
                ),
            );
        }
        throw err;
    }
};

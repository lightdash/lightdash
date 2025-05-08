import {
    ApiJobScheduledResponse,
    AuthorizationError,
    RenameType,
    SchedulerJobStatus,
} from '@lightdash/common';
import inquirer from 'inquirer';
import * as styles from '../styles';

import { getConfig } from '../config';
import GlobalState from '../globalState';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';
import {
    delay,
    getJobState,
    getValidation,
    requestValidation,
} from './validate';

type RenameHandlerOptions = {
    verbose: boolean;
    type: RenameType;
    project?: string;
    model?: string; // Model name for the field to be renamed
    from: string;
    to: string;
    test: boolean;
    assumeYes: boolean;
    list: boolean;
    validate: boolean; // TODO
};

const REFETCH_JOB_INTERVAL = 2000;
const waitUntilFinished = async (jobUuid: string): Promise<string> => {
    const job = await getJobState(jobUuid);
    if (job.status === SchedulerJobStatus.COMPLETED) {
        return job.status;
    }
    if (job.status === SchedulerJobStatus.ERROR) {
        throw new Error(
            `\nRename failed: ${job.details?.error || 'unknown error'}`,
        );
    }

    return delay(REFETCH_JOB_INTERVAL).then(() => waitUntilFinished(jobUuid));
};

const listResources = (
    resources: string[],
    type: 'charts' | 'dashboards' | 'chart alerts' | 'dashboard schedulers',
    list: boolean,
) => {
    if (resources.length === 0) return;

    const maxList = 5;
    const resourcesToShow = list ? resources : resources.slice(0, maxList);

    console.info(`- ${resourcesToShow.join('\n- ')}`);

    if (!list && resources.length > maxList) {
        console.info(
            `${styles.secondary(
                `...\nShowing ${maxList} of ${resources.length} ${type}, use --list to see all`,
            )}`,
        );
    }
};

export const renameHandler = async (options: RenameHandlerOptions) => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();

    const config = await getConfig();
    if (!config.context?.apiKey || !config.context.serverUrl) {
        throw new AuthorizationError(
            `Not logged in. Run 'lightdash login --help'`,
        );
    }

    const projectUuid = options.project || config.context.project;
    if (!projectUuid) {
        throw new Error(
            'No project selected. Run lightdash config set-project',
        );
    }

    if (!options.assumeYes && !options.test) {
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'isConfirm',
                message: `This command will replace all ${styles.title(
                    options.type,
                )} occurrences from ${styles.title(
                    options.from,
                )} to ${styles.title(
                    options.to,
                )} in all charts and dashboards in project ${styles.title(
                    projectUuid,
                )}.\nAre you sure you want to continue? `,
            },
        ]);

        if (!answers.isConfirm) {
            console.info('Aborting rename');
            return;
        }
    }

    try {
        const jobResponse = await lightdashApi<
            ApiJobScheduledResponse['results']
        >({
            method: 'POST',
            url: `/api/v1/projects/${projectUuid}/rename`,
            body: JSON.stringify(options),
        });
        GlobalState.debug(`Rename job scheduled with id: ${jobResponse.jobId}`);
        const status = await waitUntilFinished(jobResponse.jobId);
        GlobalState.debug(`Rename job finished with status: ${status}`);
        const job = await getJobState(jobResponse.jobId);

        const results = job.details?.results;
        GlobalState.debug(
            `Updated results: ${JSON.stringify(results, null, 2)}`,
        );

        console.info(
            `${styles.bold('Total updated charts:')} ${results.charts.length}`,
        );
        listResources(results.charts, 'charts', options.list);
        console.info(
            `${styles.bold('Total updated dashboards:')} ${
                results.dashboards.length
            }`,
        );
        listResources(results.dashboards, 'dashboards', options.list);

        if (results.alerts.length > 0) {
            console.info(
                `${styles.bold('Total updated alerts:')} ${
                    results.alerts.length
                }`,
            );
            listResources(results.alerts, 'chart alerts', options.list);
        }

        if (results.dashboardSchedulers.length > 0) {
            console.info(
                `${styles.bold('Total updated dashboard schedulers:')} ${
                    results.dashboardSchedulers.length
                }`,
            );
            listResources(
                results.dashboardSchedulers,
                'dashboard schedulers',
                options.list,
            );
        }

        if (options.test) {
            console.info(
                `\n${styles.warning(
                    `This is a test run, no changes were committed to the database, remove ${styles.bold(
                        '--test',
                    )} flag to make changes`,
                )}\n`,
            );
        }

        if (options.validate && !options.test) {
            // Can't validate if tests is true, changes need to be committed first

            const validationJob = await requestValidation(projectUuid, [], []);

            const { jobId } = validationJob;

            await waitUntilFinished(jobId);

            const validation = await getValidation(projectUuid, jobId);
            console.info(validation);
        }
    } catch (e: unknown) {
        // We lose the error type on the waitUntilFinished method
        const errorString = `${e}`;
        if (errorString.includes(`Rename failed`)) {
            console.error(errorString);

            if (errorString.includes('was found on multiple models'))
                console.info(
                    `Use argument ${styles.bold(
                        '--model',
                    )} to specify a model to filter on`,
                );
        } else {
            console.error('Unable to rename, unexpected error:', e);
        }
    }
};

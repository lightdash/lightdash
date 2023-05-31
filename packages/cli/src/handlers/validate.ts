import {
    ApiJobScheduledResponse,
    ApiJobStatusResponse,
    ApiValidateResponse,
    ParameterError,
    SchedulerJobStatus,
} from '@lightdash/common';
import columnify from 'columnify';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';

const requestValidation = async (projectUuid: string) =>
    lightdashApi<ApiJobScheduledResponse['results']>({
        method: 'POST',
        url: `/api/v1/projects/${projectUuid}/validate`,
        body: undefined,
    });

const getJobState = async (jobUuid: string) =>
    lightdashApi<ApiJobStatusResponse['results']>({
        method: 'GET',
        url: `/api/v1/schedulers/job/${jobUuid}/status`,
        body: undefined,
    });

const getValidation = async (projectUuid: string) =>
    lightdashApi<ApiValidateResponse['results']>({
        method: 'GET',
        url: `/api/v1/projects/${projectUuid}/validate`,
        body: undefined,
    });

function delay(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const REFETCH_JOB_INTERVAL = 3000;

type ValidateHandlerOptions = {
    project?: string;
    verbose: boolean;
};

const waitUntilFinished = async (jobUuid: string): Promise<string> => {
    const job = await getJobState(jobUuid);
    if (job.status === SchedulerJobStatus.COMPLETED) {
        return job.status;
    }
    if (job.status === SchedulerJobStatus.ERROR) {
        throw new Error(`Validation failed`);
    }

    return delay(REFETCH_JOB_INTERVAL).then(() => waitUntilFinished(jobUuid));
};

export const validateHandler = async (options: ValidateHandlerOptions) => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();

    const config = await getConfig();

    const projectUuid =
        options.project ||
        config.context?.previewProject ||
        config.context?.project;

    if (projectUuid === undefined) {
        throw new ParameterError(
            `No project specified, select a project to validate using ${styles.bold(
                `--project <projectUuid>`,
            )} or create a preview environment using ${styles.bold(
                `lightdash start-preview`,
            )} or configure your default project using ${styles.bold(
                `lightdash config set-project`,
            )}`,
        );
    }

    if (options.project) {
        console.error(`Validating project ${projectUuid}\n`);
    } else if (config.context?.previewProject) {
        console.error(
            `Validating preview project ${styles.bold(
                config.context?.previewName,
            )}\n`,
        );
    } else {
        console.error(
            `Validating project ${styles.bold(
                config.context?.projectName || projectUuid,
            )}\n`,
        );
    }

    const timeStart = new Date();
    const validationJob = await requestValidation(projectUuid);
    const { jobId } = validationJob;

    const spinner = GlobalState.startSpinner(
        `  Waiting for validation to finish`,
    );

    await waitUntilFinished(jobId);

    const validation = await getValidation(projectUuid);

    if (validation.length === 0) {
        spinner?.succeed(`  Validation finished without errors`);
    } else {
        const timeInSeconds = new Date().getTime() - timeStart.getTime();
        spinner?.fail(
            `  Successfully validated in ${Math.trunc(
                timeInSeconds / 1000,
            )}s with ${validation.length} errors`,
        );

        const tableErrors = validation.filter(
            (v) => v.chartUuid === undefined && v.dashboardUuid === undefined,
        );
        const chartErrors = validation.filter((v) => v.chartUuid !== undefined);
        const dashboardErrors = validation.filter(
            (v) => v.dashboardUuid !== undefined,
        );

        console.error(`
- Tables: ${styles.bold(tableErrors.length)} errors
- Charts: ${styles.bold(chartErrors.length)} errors
- Dashboards: ${styles.bold(dashboardErrors.length)} errors
        `);

        const validationOutput = validation.map((v) => ({
            name: styles.error(v.name),
            error: styles.warning(v.error),
        }));

        const columns = columnify(validationOutput);
        console.error(columns);

        console.error(
            `\nFor more details, visit ${styles.bold(
                `${config.context?.serverUrl}/generalSettings/projectManagement/${projectUuid}/validator`,
            )}`,
        );

        process.exit(1);
    }
};

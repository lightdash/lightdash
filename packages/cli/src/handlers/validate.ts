import {
    ApiJobScheduledResponse,
    ApiJobStatusResponse,
    ApiValidateResponse,
    Explore,
    ExploreError,
    isChartValidationError,
    isDashboardValidationError,
    isTableValidationError,
    ParameterError,
    SchedulerJobStatus,
} from '@lightdash/common';
import columnify from 'columnify';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { compile, CompileHandlerOptions } from './compile';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';

const requestValidation = async (
    projectUuid: string,
    explores: (Explore | ExploreError)[],
    onlyTables: boolean,
) =>
    lightdashApi<ApiJobScheduledResponse['results']>({
        method: 'POST',
        url: `/api/v1/projects/${projectUuid}/validate`,
        body: JSON.stringify({ explores, onlyTables }),
    });

const getJobState = async (jobUuid: string) =>
    lightdashApi<ApiJobStatusResponse['results']>({
        method: 'GET',
        url: `/api/v1/schedulers/job/${jobUuid}/status`,
        body: undefined,
    });

const getValidation = async (projectUuid: string, jobId: string) =>
    lightdashApi<ApiValidateResponse['results']>({
        method: 'GET',
        url: `/api/v1/projects/${projectUuid}/validate?jobId=${jobId}`,
        body: undefined,
    });

function delay(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const REFETCH_JOB_INTERVAL = 3000;

type ValidateHandlerOptions = CompileHandlerOptions & {
    project?: string;
    verbose: boolean;
    preview: boolean;
    onlyTables: boolean;
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

    const explores = await compile(options);
    GlobalState.debug(`> Compiled ${explores.length} explores`);

    const selectedProject = options.preview
        ? config.context?.previewProject
        : config.context?.project;
    const projectUuid = options.project || selectedProject;

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

    if (projectUuid === config.context?.previewProject) {
        console.error(
            `Validating preview project ${styles.bold(
                config.context?.previewName,
            )}\n`,
        );
    } else if (projectUuid === config.context?.project) {
        console.error(
            `Validating default project ${styles.bold(
                config.context?.projectName || projectUuid,
            )}\n`,
        );
    } else {
        console.error(`Validating project ${projectUuid}\n`);
    }

    const timeStart = new Date();

    const validationJob = await requestValidation(
        projectUuid,
        explores,
        options.onlyTables,
    );

    const { jobId } = validationJob;

    const spinner = GlobalState.startSpinner(
        `  Waiting for validation to finish`,
    );

    await waitUntilFinished(jobId);

    const validation = await getValidation(projectUuid, jobId);

    if (validation.length === 0) {
        spinner?.succeed(`  Validation finished without errors`);
    } else {
        const timeInSeconds = new Date().getTime() - timeStart.getTime();
        spinner?.fail(
            `  Successfully validated in ${Math.trunc(
                timeInSeconds / 1000,
            )}s with ${validation.length} errors`,
        );

        const tableErrors = validation.filter(isTableValidationError);
        const chartErrors = validation.filter(isChartValidationError);
        const dashboardErrors = validation.filter(isDashboardValidationError);

        if (!options.onlyTables) {
            console.error(`
- Tables: ${styles.bold(tableErrors.length)} errors
- Charts: ${styles.bold(chartErrors.length)} errors
- Dashboards: ${styles.bold(dashboardErrors.length)} errors
            `);
        }

        const validationOutput = validation.map((v) => ({
            name: styles.error(v.name),
            error: styles.warning(v.error),
        }));

        const columns = columnify(validationOutput);
        console.error(columns);

        console.error(
            `\n--> To see these errors in Lightdash, run ${styles.bold(
                `lightdash preview`,
            )}`,
        );

        process.exit(1);
    }
};

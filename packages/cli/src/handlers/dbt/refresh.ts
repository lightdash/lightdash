import {
    ApiRefreshResults,
    AuthorizationError,
    DbtProjectType,
    Job,
    JobStatusType,
    JobStep,
    JobStepStatusType,
    ParameterError,
    Project,
} from '@lightdash/common';
import ora from 'ora';
import { LightdashAnalytics } from '../../analytics/analytics';
import { getConfig } from '../../config';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { checkLightdashVersion, lightdashApi } from './apiClient';

const getProject = async (projectUuid: string) =>
    lightdashApi<Project>({
        method: 'GET',
        url: `/api/v1/projects/${projectUuid}`,
        body: undefined,
    });

const refreshProject = async (projectUuid: string) =>
    lightdashApi<ApiRefreshResults>({
        method: 'POST',
        url: `/api/v1/projects/${projectUuid}/refresh`,
        body: undefined,
    });

const getJobState = async (jobUuid: string) =>
    lightdashApi<Job>({
        method: 'GET',
        url: `/api/v1/jobs/${jobUuid}`,
        body: undefined,
    });

function delay(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export const getRunningStepsMessage = (steps: JobStep[]): string => {
    const runningStep = steps.find(
        (step) => step.stepStatus === JobStepStatusType.RUNNING,
    );
    const numberOfCompletedSteps = steps.filter(
        (step) => step.stepStatus === JobStepStatusType.DONE,
    ).length;
    return `step ${Math.min(numberOfCompletedSteps + 1, steps.length)}/${
        steps.length
    }: ${runningStep?.stepLabel || ''}`;
};

export const getErrorStepsMessage = (steps: JobStep[]): string => {
    const errorStep = steps.find(
        (step) => step.stepStatus === JobStepStatusType.ERROR,
    );
    const numberOfCompletedSteps = steps.filter(
        (step) => step.stepStatus === JobStepStatusType.DONE,
    ).length;
    return `step ${Math.min(numberOfCompletedSteps + 1, steps.length)}/${
        steps.length
    }: ${errorStep?.stepLabel || ''} error ${errorStep?.stepError}`;
};

const REFETCH_JOB_INTERVAL = 3000;

const getFinalJobState = async (jobUuid: string): Promise<Job> => {
    const job = await getJobState(jobUuid);

    if (job.jobStatus === JobStatusType.DONE) {
        return job;
    }
    if (job.jobStatus === JobStatusType.ERROR) {
        throw new Error(getErrorStepsMessage(job.steps));
    }
    const spinner = GlobalState.getActiveSpinner();
    spinner?.start(
        `  Refreshing dbt project, ${getRunningStepsMessage(job.steps)}`,
    );
    return delay(REFETCH_JOB_INTERVAL).then(() => getFinalJobState(jobUuid));
};

type RefreshHandlerOptions = {
    verbose: boolean;
};

export const refreshHandler = async (options: RefreshHandlerOptions) => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();

    const config = await getConfig();
    if (!(config.context?.project && config.context.serverUrl)) {
        throw new AuthorizationError(
            `No active Lightdash project. Run 'lightdash login --help'`,
        );
    }
    const projectUuid = config.context.project;

    const project = await getProject(projectUuid);

    if (project.dbtConnection.type === DbtProjectType.NONE) {
        throw new ParameterError(
            'Lightdash project must be connected to a remote repository. eg: GitHub, Gitlab, etc',
        );
    }

    const spinner = ora(`  Refreshing dbt project`).start();
    GlobalState.setActiveSpinner(spinner);
    try {
        await LightdashAnalytics.track({
            event: 'refresh.started',
            properties: {
                projectId: projectUuid,
            },
        });
        const refreshResults = await refreshProject(projectUuid);

        await getFinalJobState(refreshResults.jobUuid);

        await LightdashAnalytics.track({
            event: 'refresh.completed',
            properties: {
                projectId: projectUuid,
            },
        });
        spinner.stop();
    } catch (e) {
        await LightdashAnalytics.track({
            event: 'refresh.error',
            properties: {
                projectId: projectUuid,
                error: `Error refreshing project: ${e}`,
            },
        });
        spinner.fail();
        throw e;
    }

    const displayUrl = `${config.context?.serverUrl}/projects/${projectUuid}/home`;

    console.error(`${styles.bold('Successfully refreshed project:')}`);
    console.error('');
    console.error(`      ${styles.bold(`⚡️ ${displayUrl}`)}`);
    console.error('');
};

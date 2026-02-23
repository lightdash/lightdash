import {
    ApiJobScheduledResponse,
    ApiJobStatusResponse,
    ApiValidateResponse,
    Explore,
    ExploreError,
    formatDate,
    getErrorMessage,
    isChartValidationError,
    isDashboardValidationError,
    isTableValidationError,
    ParameterError,
    SchedulerJobStatus,
    UnexpectedServerError,
    ValidationErrorType,
    ValidationTarget,
} from '@lightdash/common';
import columnify from 'columnify';
import { v4 as uuidv4 } from 'uuid';
import { categorizeError, LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { compile, CompileHandlerOptions } from './compile';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';

export const requestValidation = async (
    projectUuid: string,
    explores: (Explore | ExploreError)[],
    validationTargets: ValidationTarget[],
) =>
    lightdashApi<ApiJobScheduledResponse['results']>({
        method: 'POST',
        url: `/api/v1/projects/${projectUuid}/validate`,
        body: JSON.stringify({ explores, validationTargets }),
    });

export const getJobState = async (jobUuid: string) =>
    lightdashApi<ApiJobStatusResponse['results']>({
        method: 'GET',
        url: `/api/v1/schedulers/job/${jobUuid}/status`,
        body: undefined,
    });

export const getValidation = async (projectUuid: string, jobId: string) =>
    lightdashApi<ApiValidateResponse['results']>({
        method: 'GET',
        url: `/api/v1/projects/${projectUuid}/validate?jobId=${jobId}`,
        body: undefined,
    });

export function delay(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function styleTotalErrors(total: number) {
    if (total > 0) {
        return styles.error(`${styles.bold(total)} errors`);
    }
    return styles.success(`${styles.bold(total)} errors`);
}

const REFETCH_JOB_INTERVAL = 3000;

type ValidateHandlerOptions = CompileHandlerOptions & {
    project?: string;
    verbose: boolean;
    preview: boolean;
    only: ValidationTarget[];
    showChartConfigurationWarnings: boolean;
};

export const waitUntilFinished = async (jobUuid: string): Promise<string> => {
    const job = await getJobState(jobUuid);
    if (job.status === SchedulerJobStatus.COMPLETED) {
        return job.status;
    }
    if (job.status === SchedulerJobStatus.ERROR) {
        throw new UnexpectedServerError(
            `\nValidation failed: ${job.details?.error || 'unknown error'}`,
        );
    }

    return delay(REFETCH_JOB_INTERVAL).then(() => waitUntilFinished(jobUuid));
};

export const validateHandler = async (options: ValidateHandlerOptions) => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();

    const executionId = uuidv4();
    const startTime = Date.now();

    const config = await getConfig();

    // Log current project info
    GlobalState.logProjectInfo(config);

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

    const isPreview = projectUuid === config.context?.previewProject;

    if (isPreview) {
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

    const validationTargets = options.only ? options.only : [];

    await LightdashAnalytics.track({
        event: 'validate.started',
        properties: {
            executionId,
            projectId: projectUuid,
            isPreview,
            validationTargets,
        },
    });

    let shouldExitWithError = false;
    try {
        const explores = await compile(options);
        GlobalState.debug(`> Compiled ${explores.length} explores`);

        const validationJob = await requestValidation(
            projectUuid,
            explores,
            validationTargets,
        );

        const { jobId } = validationJob;

        const spinner = GlobalState.startSpinner(
            `  Waiting for validation to finish`,
        );

        await waitUntilFinished(jobId);

        const allValidation = await getValidation(projectUuid, jobId);

        // Filter out chart configuration warnings unless explicitly requested
        const validation = options.showChartConfigurationWarnings
            ? allValidation
            : allValidation.filter(
                  (v) =>
                      !isChartValidationError(v) ||
                      v.errorType !== ValidationErrorType.ChartConfiguration,
              );

        const hiddenWarningsCount = allValidation.length - validation.length;
        const tableErrors = validation.filter(isTableValidationError);
        const chartErrors = validation.filter(isChartValidationError);
        const dashboardErrors = validation.filter(isDashboardValidationError);

        await LightdashAnalytics.track({
            event: 'validate.completed',
            properties: {
                executionId,
                projectId: projectUuid,
                isPreview,
                validationTargets,
                durationMs: Date.now() - startTime,
                totalErrors: validation.length,
                tableErrors: tableErrors.length,
                chartErrors: chartErrors.length,
                dashboardErrors: dashboardErrors.length,
            },
        });

        if (validation.length === 0) {
            const elapsedMs = Date.now() - startTime;
            const hiddenMessage =
                hiddenWarningsCount > 0
                    ? ` (${hiddenWarningsCount} chart configuration warning${
                          hiddenWarningsCount > 1 ? 's' : ''
                      } hidden, use --show-chart-configuration-warnings to show)`
                    : '';
            spinner?.succeed(
                `  Validation finished without errors in ${Math.trunc(
                    elapsedMs / 1000,
                )}s${hiddenMessage}`,
            );
        } else {
            const elapsedMs = Date.now() - startTime;
            spinner?.fail(
                `  Validation finished in ${Math.trunc(
                    elapsedMs / 1000,
                )}s with ${validation.length} errors`,
            );

            const validationTargetsSet = new Set(validationTargets);
            const hasValidationTargets = validationTargetsSet.size > 0;

            console.error('\n');

            if (
                !hasValidationTargets ||
                validationTargetsSet.has(ValidationTarget.TABLES)
            ) {
                console.error(
                    `- Tables: ${styleTotalErrors(tableErrors.length)}`,
                );
            }

            if (
                !hasValidationTargets ||
                validationTargetsSet.has(ValidationTarget.CHARTS)
            ) {
                console.error(
                    `- Charts: ${styleTotalErrors(chartErrors.length)}`,
                );
            }

            if (
                !hasValidationTargets ||
                validationTargetsSet.has(ValidationTarget.DASHBOARDS)
            ) {
                console.error(
                    `- Dashboards: ${styleTotalErrors(dashboardErrors.length)}`,
                );
            }

            console.error('\n');

            const validationOutput = validation.map((v) => ({
                name: styles.error(v.name),
                error: styles.warning(
                    isChartValidationError(v) &&
                        v.errorType ===
                            ValidationErrorType.ChartConfiguration &&
                        v.fieldName
                        ? `Chart configuration warning: '${v.fieldName}' - ${v.error}`
                        : v.error,
                ),
                'last updated by':
                    isChartValidationError(v) || isDashboardValidationError(v)
                        ? styles.secondary(v.lastUpdatedBy)
                        : '',
                'last updated at':
                    isChartValidationError(v) || isDashboardValidationError(v)
                        ? styles.secondary(formatDate(v.lastUpdatedAt))
                        : '',
            }));

            const columns = columnify(validationOutput, {
                columns: [
                    'name',
                    'last updated by',
                    'last updated at',
                    'error',
                ],
                config: {
                    'last updated at': {
                        align: 'center',
                    },
                },
            });
            console.error(columns);

            console.error(
                `\n--> To see these errors in Lightdash, run ${styles.bold(
                    `lightdash preview`,
                )}`,
            );

            if (hiddenWarningsCount > 0) {
                console.error(
                    `\n${styles.secondary(
                        `Note: ${hiddenWarningsCount} chart configuration warning${
                            hiddenWarningsCount > 1 ? 's' : ''
                        } hidden. Use --show-chart-configuration-warnings to show.`,
                    )}`,
                );
            }

            shouldExitWithError = true;
        }
    } catch (e) {
        await LightdashAnalytics.track({
            event: 'validate.error',
            properties: {
                executionId,
                error: getErrorMessage(e),
                errorCategory: categorizeError(e),
            },
        });
        throw e;
    }

    if (shouldExitWithError) {
        process.exit(1);
    }
};

import { LightdashError, LightdashUser } from '@lightdash/common';
import fetch from 'node-fetch';
import { Config, getConfig } from '../config';
import { getInstallMethod } from '../env';
import GlobalState from '../globalState';
import { lightdashApi } from '../handlers/dbt/apiClient';

const { version: VERSION } = require('../../package.json');

type CIInfo = {
    isCI: boolean;
    ciProvider: string | null;
};

const detectCI = (): CIInfo => {
    if (process.env.GITHUB_ACTIONS)
        return { isCI: true, ciProvider: 'github_actions' };
    if (process.env.GITLAB_CI) return { isCI: true, ciProvider: 'gitlab' };
    if (process.env.CIRCLECI) return { isCI: true, ciProvider: 'circleci' };
    if (process.env.JENKINS_URL) return { isCI: true, ciProvider: 'jenkins' };
    if (process.env.BITBUCKET_PIPELINE_UUID)
        return { isCI: true, ciProvider: 'bitbucket' };
    if (process.env.TF_BUILD) return { isCI: true, ciProvider: 'azure_devops' };
    if (process.env.CI) return { isCI: true, ciProvider: 'unknown' };
    return { isCI: false, ciProvider: null };
};

const identifyUser = async (): Promise<Config['user']> => {
    const config = await getConfig();
    if (config.context?.serverUrl && config.context.apiKey) {
        try {
            const user = await lightdashApi<LightdashUser>({
                method: 'GET',
                url: '/api/v1/user',
                body: undefined,
            });
            return {
                anonymousUuid: config.user?.anonymousUuid,
                userUuid: user.userUuid,
            };
        } catch {
            // do nothing
        }
    }
    return {
        anonymousUuid: config.user?.anonymousUuid,
        userUuid: config.user?.userUuid,
        organizationUuid: config.user?.organizationUuid,
    };
};

export interface AnalyticsTrack {
    event: string;
    properties?: Record<string, unknown>;
    context?: Record<string, unknown>;
}

type BaseTrack = Omit<AnalyticsTrack, 'context'>;

/** Events triggered on `preinstall` and `postinstall` in package.json: track.sh
- install.started
- install.completed
*/
type CliGenerateExposuresStarted = BaseTrack & {
    event: 'generate_exposures.started';
    properties: {
        executionId: string;
    };
};
type CliGenerateExposuresCompleted = BaseTrack & {
    event: 'generate_exposures.completed';
    properties: {
        executionId: string;
        countExposures: number;
        durationMs: number;
    };
};
type CliGenerateExposuresError = BaseTrack & {
    event: 'generate_exposures.error';
    properties: {
        executionId: string;
    };
};

type CliGenerateStarted = BaseTrack & {
    event: 'generate.started';
    properties: {
        executionId: string;
        numModelsSelected: number | undefined;
        trigger: string; // generate or dbt
    };
};
type CliGenerateCompleted = BaseTrack & {
    event: 'generate.completed';
    properties: {
        executionId: string;
        numModelsSelected: number | undefined;
        trigger: string; // generate or dbt
        durationMs: number;
    };
};
type CliGenerateError = BaseTrack & {
    event: 'generate.error';
    properties: {
        executionId: string;
        trigger: string;
        error: string;
    };
};
type CliDbtCommand = BaseTrack & {
    event: 'dbt_command.started';
    properties: {
        command: string;
    };
};

type CliDbtCommandCompleted = BaseTrack & {
    event: 'dbt_command.completed';
    properties: {
        command: string;
        durationMs: number;
    };
};

type CliDbtError = BaseTrack & {
    event: 'dbt_command.error';
    properties: {
        command: string;
        error: string;
        durationMs: number;
    };
};

type CliPreviewStarted = BaseTrack & {
    event: 'preview.started';
    properties: {
        executionId: string;
        projectId: string;
    };
};
type CliPreviewCompleted = BaseTrack & {
    event: 'preview.completed';
    properties: {
        executionId: string;
        projectId: string;
        durationMs: number;
    };
};
type CliPreviewStopped = BaseTrack & {
    event: 'preview.stopped';
    properties: {
        executionId: string;
        projectId: string;
        durationMs: number;
    };
};
type CliPreviewError = BaseTrack & {
    event: 'preview.error';
    properties: {
        executionId: string;
        projectId: string;
        error: string;
    };
};

type CliRefreshStarted = BaseTrack & {
    event: 'refresh.started';
    properties: {
        executionId: string;
        projectId: string;
    };
};
type CliRefreshCompleted = BaseTrack & {
    event: 'refresh.completed';
    properties: {
        executionId: string;
        projectId: string;
        durationMs: number;
    };
};
type CliRefreshError = BaseTrack & {
    event: 'refresh.error';
    properties: {
        executionId: string;
        projectId: string;
        error: string;
    };
};

type CliCompileStarted = BaseTrack & {
    event: 'compile.started';
    properties: {
        executionId: string;
        dbtVersion?: string;
        skipDbtCompile: boolean;
        skipWarehouseCatalog: boolean;
        useDbtList: boolean;
    };
};
type CliCompileCompleted = BaseTrack & {
    event: 'compile.completed';
    properties: {
        executionId: string;
        explores: number;
        errors: number;
        dbtMetrics: number;
        dbtVersion?: string;
        durationMs: number;
    };
};
type CliCompileError = BaseTrack & {
    event: 'compile.error';
    properties: {
        executionId: string;
        dbtVersion?: string;
        error: string;
    };
};

type CliDeployTriggered = BaseTrack & {
    event: 'deploy.triggered';
    properties: {
        projectId: string;
        durationMs: number;
        payloadSizeBytes?: number;
    };
};

type CliCreateStarted = BaseTrack & {
    event: 'create.started';
    properties: {
        executionId: string;
        projectName: string;
        isDefaultName: boolean;
    };
};
type CliCreateCompleted = BaseTrack & {
    event: 'create.completed';
    properties: {
        executionId: string;
        projectId: string;
        projectName: string;
        durationMs: number;
    };
};
type CliCreateError = BaseTrack & {
    event: 'create.error';
    properties: {
        executionId: string;
        error: string;
    };
};

type CliStartStopPreview = BaseTrack & {
    event:
        | 'start_preview.update'
        | 'start_preview.create'
        | 'stop_preview.delete'
        | 'stop_preview.missing';
    properties: {
        executionId: string;
        projectId: string;
        name: string;
    };
};
type CliStopPreviewMissing = BaseTrack & {
    event: 'stop_preview.missing';
    properties: {
        name: string;
    };
};

type CliLogin = BaseTrack & {
    event: 'login.started' | 'login.completed';
    properties: {
        userId?: string;
        organizationId?: string;
        method: string;
        url: string;
    };
};

type CliContentAsCode = BaseTrack &
    (
        | {
              event: 'download.started' | 'upload.started';
              properties: {
                  userId?: string;
                  organizationId?: string;
                  projectId: string;
              };
          }
        | {
              event: 'download.completed' | 'upload.completed';
              properties: {
                  userId?: string;
                  organizationId?: string;
                  projectId: string;
                  chartsNum?: number;
                  dashboardsNum?: number;
                  timeToCompleted: number; // in seconds
              };
          }
        | {
              event: 'download.error' | 'upload.error';
              properties: {
                  userId?: string;
                  organizationId?: string;
                  projectId: string;
                  type?: 'charts' | 'dashboards'; // Error uploading specific charts or dashboards, this error is not blocking
                  error: string;
              };
          }
    );

type CliLightdashConfigLoaded = BaseTrack & {
    event: 'lightdashconfig.loaded';
    properties: {
        userId?: string;
        organizationId?: string;
        projectId: string;
        categories_count?: number;
        default_visibility?: 'show' | 'hide';
    };
};

type CliValidateStarted = BaseTrack & {
    event: 'validate.started';
    properties: {
        executionId: string;
        projectId: string;
        isPreview: boolean;
        validationTargets: string[];
    };
};
/** `success` indicates whether 0 validation errors were found, not whether the process ran without crashing (crashes fire `validate.error` instead). */
type CliValidateCompleted = BaseTrack & {
    event: 'validate.completed';
    properties: {
        executionId: string;
        projectId: string;
        isPreview: boolean;
        validationTargets: string[];
        durationMs: number;
        success: boolean;
        totalErrors: number;
        tableErrors: number;
        chartErrors: number;
        dashboardErrors: number;
    };
};
type CliValidateError = BaseTrack & {
    event: 'validate.error';
    properties: {
        executionId: string;
        error: string;
        errorCategory: string;
    };
};

type CliSqlStarted = BaseTrack & {
    event: 'sql.started';
    properties: {
        executionId: string;
        projectId: string;
    };
};
type CliSqlCompleted = BaseTrack & {
    event: 'sql.completed';
    properties: {
        executionId: string;
        projectId: string;
        rowCount: number;
        columnCount: number;
        durationMs: number;
    };
};
type CliSqlError = BaseTrack & {
    event: 'sql.error';
    properties: {
        executionId: string;
        error: string;
        errorCategory: string;
    };
};

type CliLintCompleted = BaseTrack & {
    event: 'lint.completed';
    properties: {
        executionId: string;
        filesScanned: number;
        lightdashFilesFound: number;
        validFiles: number;
        invalidFiles: number;
        chartFiles: number;
        dashboardFiles: number;
        modelFiles: number;
        outputFormat: string;
        durationMs: number;
    };
};

type CliLintError = BaseTrack & {
    event: 'lint.error';
    properties: {
        executionId: string;
        error: string;
        errorCategory: string;
    };
};

type CliRenameCompleted = BaseTrack & {
    event: 'rename.completed';
    properties: {
        executionId: string;
        projectId: string;
        renameType: string;
        isDryRun: boolean;
        chartsUpdated: number;
        dashboardsUpdated: number;
        durationMs: number;
    };
};
type CliRenameError = BaseTrack & {
    event: 'rename.error';
    properties: {
        executionId: string;
        error: string;
        errorCategory: string;
    };
};

type CliCommandExecuted = BaseTrack & {
    event: 'command.executed';
    properties: {
        command: string;
        durationMs: number;
        success: boolean;
    };
};

type CliGenerateDocsStarted = BaseTrack & {
    event: 'generate_docs.started';
    properties: {
        executionId: string;
    };
};
type CliGenerateDocsCompleted = BaseTrack & {
    event: 'generate_docs.completed';
    properties: {
        executionId: string;
        durationMs: number;
        skipInject: boolean;
        serve: boolean;
    };
};
type CliGenerateDocsError = BaseTrack & {
    event: 'generate_docs.error';
    properties: {
        executionId: string;
        step: string;
        error: string;
    };
};

type Track =
    | CliGenerateStarted
    | CliGenerateCompleted
    | CliGenerateError
    | CliDbtCommand
    | CliDbtCommandCompleted
    | CliDbtError
    | CliPreviewStarted
    | CliPreviewCompleted
    | CliPreviewStopped
    | CliPreviewError
    | CliRefreshStarted
    | CliRefreshCompleted
    | CliRefreshError
    | CliCompileStarted
    | CliCompileCompleted
    | CliCompileError
    | CliDeployTriggered
    | CliCreateStarted
    | CliCreateCompleted
    | CliCreateError
    | CliStartStopPreview
    | CliStopPreviewMissing
    | CliGenerateExposuresStarted
    | CliGenerateExposuresCompleted
    | CliGenerateExposuresError
    | CliLogin
    | CliContentAsCode
    | CliLightdashConfigLoaded
    | CliValidateStarted
    | CliValidateCompleted
    | CliValidateError
    | CliSqlStarted
    | CliSqlCompleted
    | CliSqlError
    | CliLintCompleted
    | CliLintError
    | CliRenameCompleted
    | CliRenameError
    | CliCommandExecuted
    | CliGenerateDocsStarted
    | CliGenerateDocsCompleted
    | CliGenerateDocsError;

const ERROR_NAME_TO_CATEGORY: Record<string, string> = {
    ForbiddenError: 'forbidden',
    AuthorizationError: 'authorization',
    ParameterError: 'parameter',
    NotFoundError: 'not_found',
    CompileError: 'compile',
    DbtError: 'dbt',
    WarehouseConnectionError: 'warehouse_connection',
    WarehouseQueryError: 'warehouse_query',
};

export const categorizeError = (error: unknown): string => {
    if (error instanceof LightdashError) {
        return ERROR_NAME_TO_CATEGORY[error.name] ?? 'lightdash';
    }
    if (error instanceof Error) {
        const msg = error.message;
        if (
            msg.includes('ECONNREFUSED') ||
            msg.includes('ENOTFOUND') ||
            msg.includes('ETIMEDOUT')
        ) {
            return 'network';
        }
    }
    return 'unknown';
};

export class LightdashAnalytics {
    private static getWriteKey(): string {
        return process.env.NODE_ENV === 'development'
            ? 'MXZpa2VHYWR0QjBZMG9SREZOTDJQcmRoa2JwOg=='
            : 'MXZxa1NsV01WdFlPbDcwcmszUVNFMHYxZnFZOg==';
    }

    static async track(payload: Track): Promise<void> {
        try {
            const user = await identifyUser();
            const ci = detectCI();
            const lightdashContext = {
                app: {
                    namespace: 'lightdash',
                    name: 'lightdash_cli',
                    version: VERSION,
                    installMethod: getInstallMethod(),
                    sessionId: GlobalState.getSessionId(),
                },
                ci,
            };

            const body = {
                anonymousId: user?.anonymousUuid,
                userId: user?.userUuid,
                ...payload,
                event: `${lightdashContext.app.name}.${payload.event}`,
                context: { ...lightdashContext },
            };

            await fetch('https://analytics.lightdash.com/v1/track', {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${LightdashAnalytics.getWriteKey()}`,
                },
                body: JSON.stringify(body),
            });
        } catch (e) {
            // do nothing
        }
    }

    static async identify(traits: Record<string, unknown>): Promise<void> {
        try {
            const user = await identifyUser();
            const body = {
                anonymousId: user?.anonymousUuid,
                userId: user?.userUuid,
                traits: {
                    cli_version: VERSION,
                    install_method: getInstallMethod(),
                    ...traits,
                },
            };

            await fetch('https://analytics.lightdash.com/v1/identify', {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${LightdashAnalytics.getWriteKey()}`,
                },
                body: JSON.stringify(body),
            });
        } catch (e) {
            // do nothing
        }
    }
}

export const analytics: LightdashAnalytics = new LightdashAnalytics();

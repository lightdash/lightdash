import { LightdashUser } from '@lightdash/common';
import fetch from 'node-fetch';
import { Config, getConfig } from '../config';
import { lightdashApi } from '../handlers/dbt/apiClient';

const { version: VERSION } = require('../../package.json');

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

type CliDbtError = BaseTrack & {
    event: 'dbt_command.error';
    properties: {
        command: string;
        error: string;
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
    };
};
type CliPreviewStopped = BaseTrack & {
    event: 'preview.stopped';
    properties: {
        executionId: string;
        projectId: string;
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
        dbtVersion: string;
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
        dbtVersion: string;
    };
};
type CliCompileError = BaseTrack & {
    event: 'compile.error';
    properties: {
        executionId: string;
        dbtVersion: string;
        error: string;
    };
};

type CliDeployTriggered = BaseTrack & {
    event: 'deploy.triggered';
    properties: {
        projectId: string;
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
        method: string;
        url: string;
    };
};

type Track =
    | CliGenerateStarted
    | CliGenerateCompleted
    | CliGenerateError
    | CliDbtCommand
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
    | CliLogin;

export class LightdashAnalytics {
    static async track(payload: Track): Promise<void> {
        try {
            const user = await identifyUser();
            const lightdashContext = {
                app: {
                    namespace: 'lightdash',
                    name: 'lightdash_cli',
                    version: VERSION,
                },
            };

            const body = {
                anonymousId: user?.anonymousUuid,
                userId: user?.userUuid,
                ...payload,
                event: `${lightdashContext.app.name}.${payload.event}`,
                context: { ...lightdashContext },
            };

            const encodedWriteKey =
                process.env.NODE_ENV === 'development'
                    ? 'MXZpa2VHYWR0QjBZMG9SREZOTDJQcmRoa2JwOg=='
                    : 'MXZxa1NsV01WdFlPbDcwcmszUVNFMHYxZnFZOg==';
            await fetch('https://analytics.lightdash.com/v1/track', {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${encodedWriteKey}`,
                },
                body: JSON.stringify(body),
            });
        } catch (e) {
            // do nothing
        }
    }
}

export const analytics: LightdashAnalytics = new LightdashAnalytics();

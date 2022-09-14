import { LightdashUser } from '@lightdash/common';
import fetch from 'node-fetch';
import { Config, getConfig } from '../config';
import { lightdashApi } from '../handlers/dbt/apiClient';

const { version: VERSION } = require('../../package.json');

const identifyUser = async (): Promise<Config['user']> => {
    const config = await getConfig();
    if (
        process.env.LIGHTDASH_API_KEY &&
        config.context?.serverUrl &&
        config.context.apiKey
    ) {
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
    properties?: Record<string, any>;
    context?: Record<string, any>;
}

type BaseTrack = Omit<AnalyticsTrack, 'context'>;

/** Events triggered on `preinstall` and `postinstall` in package.json: track.sh
- install.started
- install.completed
*/

type CliGenerateStarted = BaseTrack & {
    event: 'generate.started';
    properties: {
        numModelsSelected: number | undefined;
        trigger: string; // generate or dbt
    };
};
type CliGenerateCompleted = BaseTrack & {
    event: 'generate.completed';
    properties: {
        numModelsSelected: number | undefined;
        trigger: string; // generate or dbt
    };
};
type CliGenerateError = BaseTrack & {
    event: 'generate.error';
    properties: {
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
        projectId: string;
    };
};
type CliPreviewCompleted = BaseTrack & {
    event: 'preview.completed';
    properties: {
        projectId: string;
    };
};
type CliPreviewError = BaseTrack & {
    event: 'preview.error';
    properties: {
        projectId: string;
        error: string;
    };
};

type CliCompileStarted = BaseTrack & {
    event: 'compile.started';
    properties: {};
};
type CliCompileCompleted = BaseTrack & {
    event: 'compile.completed';
    properties: {};
};
type CliCompileError = BaseTrack & {
    event: 'compile.error';
    properties: {
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
        projectName: string;
        isDefaultName: boolean;
    };
};
type CliCreateCompleted = BaseTrack & {
    event: 'create.completed';
    properties: {
        projectId: string;
        projectName: string;
    };
};
type CliCreateError = BaseTrack & {
    event: 'create.error';
    properties: {
        error: string;
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
    | CliPreviewError
    | CliCompileStarted
    | CliCompileCompleted
    | CliCompileError
    | CliDeployTriggered
    | CliCreateStarted
    | CliCreateCompleted
    | CliCreateError;

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
            await fetch('https://analytics.lightdash.com/v1/track', {
                method: 'POST',
                headers: {
                    Authorization:
                        'Basic MXZxa1NsV01WdFlPbDcwcmszUVNFMHYxZnFZOg==',
                },
                body: JSON.stringify(body),
            });
        } catch (e) {
            // do nothing
        }
    }
}

export const analytics: LightdashAnalytics = new LightdashAnalytics();

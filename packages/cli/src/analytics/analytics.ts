import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const { version: VERSION } = require('../../package.json');

export interface AnalyticsTrack {
    userId?: string;
    anonymousId?: string;
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
type Track =
    | CliGenerateStarted
    | CliGenerateCompleted
    | CliGenerateError
    | CliDbtCommand
    | CliDbtError;

export class LightdashAnalytics {
    static async track(payload: Track): Promise<void> {
        try {
            const lightdashContext = {
                app: {
                    namespace: 'lightdash',
                    name: 'lightdash_cli',
                    version: VERSION,
                },
            };

            const body = {
                anonymousId: uuidv4(),
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

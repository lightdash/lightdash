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

type CliInstallStarted = BaseTrack & {
    event: 'install_started';
};
type CliInstallCompleted = BaseTrack & {
    event: 'install_completed';
};
type CliGenerateStarted = BaseTrack & {
    event: 'generate_started';
    properties: {
        numModelsSelected: number | undefined;
        trigger: string; // generate or dbt
    };
};
type CliGenerateCompleted = BaseTrack & {
    event: 'generate_completed';
    properties: {
        numModelsSelected: number | undefined;
        trigger: string; // generate or dbt
    };
};
type CliGenerateError = BaseTrack & {
    event: 'generate_error';
    properties: {
        trigger: string;
        error: string;
    };
};
type CliDbtCommand = BaseTrack & {
    event: 'dbt_command';
    properties: {
        command: string;
    };
};

type CliDbtError = BaseTrack & {
    event: 'dbt_error';
    properties: {
        command: string;
        error: string;
    };
};
type Track =
    | CliInstallStarted
    | CliInstallCompleted
    | CliGenerateStarted
    | CliGenerateCompleted
    | CliGenerateError
    | CliDbtCommand
    | CliDbtError;

export class LightdashAnalytics {
    static async track(payload: Track): Promise<void> {
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
                Authorization: 'Basic MXZxa1NsV01WdFlPbDcwcmszUVNFMHYxZnFZOg==',
            },
            body: JSON.stringify(body),
        });
    }
}

export const analytics: LightdashAnalytics = new LightdashAnalytics();

/// <reference path="rudder-sdk-node.d.ts" />
import Analytics, {
    Track as AnalyticsTrack,
} from '@rudderstack/rudder-sdk-node';
import { v4 as uuidv4 } from 'uuid';

const { version: VERSION } = require('../../package.json');

type BaseTrack = Omit<AnalyticsTrack, 'context'>;

type CliInstallStarted = BaseTrack & {
    event: 'cli_install_started';
};
type CliInstallCompleted = BaseTrack & {
    event: 'cli_install_completed';
};
type CliGenerateStarted = BaseTrack & {
    event: 'cli_generate_started';
    properties: {
        numModelsSelected: number | undefined;
        trigger: string; // generate or dbt
    };
};
type CliGenerateCompleted = BaseTrack & {
    event: 'cli_generate_completed';
    properties: {
        numModelsSelected: number | undefined;
        trigger: string; // generate or dbt
    };
};
type CliGenerateError = BaseTrack & {
    event: 'cli_generate_error';
    properties: {
        trigger: string;
        error: string;
    };
};
type CliDbtCommand = BaseTrack & {
    event: 'cli_dbt_command';
    properties: {
        command: string;
    };
};

type CliDbtError = BaseTrack & {
    event: 'cli_dbt_error';
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

class LightdashAnalytics extends Analytics {
    static lightdashContext = {
        app: {
            namespace: 'lightdash',
            name: 'lightdash_cli',
            version: VERSION,
        },
    };

    track(payload: Track) {
        super.track({
            anonymousId: uuidv4(),
            ...payload,
            event: `${LightdashAnalytics.lightdashContext.app.name}.${payload.event}`,
            context: { ...LightdashAnalytics.lightdashContext }, // NOTE: spread because rudderstack manipulates arg
        });
    }
}

export const analytics: LightdashAnalytics = new LightdashAnalytics(
    '1u1wwlT1wrKltYqbctwmDRJk69M',
    'https://analytics.lightdash.com/v1/batch',
    {
        enable: true,
    },
);

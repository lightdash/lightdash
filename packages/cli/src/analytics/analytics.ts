/// <reference path="rudder-sdk-node.d.ts" />
import Analytics, {
    Track as AnalyticsTrack,
} from '@rudderstack/rudder-sdk-node';
import { v4 as uuidv4 } from 'uuid';

const { version: VERSION } = require('../../package.json');

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

class LightdashAnalytics extends Analytics {
    static lightdashContext = {
        app: {
            namespace: 'lightdash',
            name: 'lightdash_cli',
            version: VERSION,
        },
    };

    track(payload: Track) {
        console.log('adding tracking ', payload.event);
        super.track({
            anonymousId: uuidv4(),
            ...payload,
            event: `${LightdashAnalytics.lightdashContext.app.name}.${payload.event}`,
            context: { ...LightdashAnalytics.lightdashContext }, // NOTE: spread because rudderstack manipulates arg
        });
    }

    async flush(): Promise<void> {
        return new Promise((resolve, reject) => {
            super.flush((err: any, batch: any) => {
                console.log('flush', err, batch);
                if (err) return reject(err);
                return resolve(batch);
            });
        });
    }
}

export const analytics: LightdashAnalytics = new LightdashAnalytics(
    '1vqkSlWMVtYOl70rk3QSE0v1fqY',
    'https://analytics.lightdash.com/v1/batch',
);

import {
    ApiConnectorType,
    getHydraSettingsProblem,
    HYDRA_ORIGIN,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import { type LiveConnection } from '../../sdk';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.HYDRA];

export const hydraConnection: LiveConnection<ApiConnectorType.HYDRA> = {
    settings: CATALOG.settings,
    origins: [HYDRA_ORIGIN],
    // Hydra answers from the rows it seeds, so a source may call nothing
    access: () => ({ rules: [] }),
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Hydra connections authenticate with a token',
            );
        }
    },
    validate: (settings) => {
        const problem = getHydraSettingsProblem(settings);
        if (problem) {
            throw new ParameterError(`The Hydra setting ${problem}`);
        }
    },
    describeTarget: () =>
        'Hydra test data: seeded product events and users, for testing',
};

import {
    ApiConnectorType,
    ATTIO_OBJECTS,
    ATTIO_ORIGIN,
    ATTIO_WORKSPACE_MEMBERS_PATH,
    getAttioAttributesPath,
    getAttioRecordsQueryPath,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import { readRule, type LiveConnection } from '../../sdk';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.ATTIO];

export const attioConnection: LiveConnection<ApiConnectorType.ATTIO> = {
    settings: CATALOG.settings,
    origins: [ATTIO_ORIGIN],
    access: () => ({
        rules: [
            ...ATTIO_OBJECTS.flatMap((object) => [
                readRule('GET', getAttioAttributesPath(object)),
                readRule('POST', getAttioRecordsQueryPath(object)),
            ]),
            readRule('GET', ATTIO_WORKSPACE_MEMBERS_PATH),
        ],
    }),
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Attio connections authenticate with an access token',
            );
        }
    },
    describeTarget: () =>
        'Attio workspace: companies, people, deals, users and workspaces',
};

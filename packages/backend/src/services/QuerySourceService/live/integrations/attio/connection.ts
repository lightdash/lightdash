import {
    ApiConnectorType,
    ATTIO_OBJECTS,
    ATTIO_OBJECTS_PATH,
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
    access: (_settings, explores) => ({
        rules: [
            ...ATTIO_OBJECTS.flatMap((object) => [
                readRule('GET', getAttioAttributesPath(object)),
                readRule('POST', getAttioRecordsQueryPath(object)),
            ]),
            readRule('GET', ATTIO_WORKSPACE_MEMBERS_PATH),
            // A Refresh lists the custom objects, then reads each one's
            // attributes before any of them is an explore
            readRule('GET', ATTIO_OBJECTS_PATH, { exact: true }),
            readRule('GET', getAttioAttributesPath('{object}'), {
                exact: true,
            }),
            // Records of a custom object only once a Refresh offered it
            ...explores.flatMap(({ name, apiName }) =>
                apiName === undefined
                    ? []
                    : [
                          readRule('POST', getAttioRecordsQueryPath(apiName), {
                              exact: true,
                              entry: name,
                          }),
                      ],
            ),
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
        'Attio workspace: companies, people, deals, users, workspaces and custom objects',
};

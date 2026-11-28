import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import { readRule, type LiveConnection } from '../../sdk';
import { assertGoogleSignIn } from '../google/signIn';
import { SEARCH_CONSOLE_ORIGIN, SEARCH_CONSOLE_SITES_PATH } from './api';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.SEARCH_CONSOLE];
const LABEL = CATALOG.messageLabel;
const SITE_URL = /^(sc-domain:[a-z0-9.-]+|https?:\/\/[^\s/?#]+\/[^\s?#]*)$/i;

export const searchConsoleConnection: LiveConnection<ApiConnectorType.SEARCH_CONSOLE> =
    {
        settings: CATALOG.settings,
        origins: [SEARCH_CONSOLE_ORIGIN],
        // The token already limits the source to sites the account can read.
        access: () => ({
            rules: [readRule('POST', SEARCH_CONSOLE_SITES_PATH)],
        }),
        checkAuth: (connection) => assertGoogleSignIn(LABEL, connection),
        validate: ({ siteUrl }) => {
            if (!SITE_URL.test(siteUrl)) {
                throw new ParameterError(
                    'The Search Console site must look like https://example.com/ or sc-domain:example.com',
                );
            }
        },
        describeTarget: ({ settings: { siteUrl } }) =>
            `Search Console site ${siteUrl}`,
    };

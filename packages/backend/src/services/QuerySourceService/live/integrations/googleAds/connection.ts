import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import { readRule, type LiveConnection } from '../../sdk';
import { assertGoogleSignIn } from '../google/signIn';
import { getGoogleAdsSearchPath, GOOGLE_ADS_ORIGIN } from './api';

const GOOGLE_ADS_CUSTOMER_ID = /^\d{10}$/;
const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.GOOGLE_ADS];
const LABEL = CATALOG.messageLabel;

export const googleAdsConnection: LiveConnection<ApiConnectorType.GOOGLE_ADS> =
    {
        settings: CATALOG.settings,
        origins: [GOOGLE_ADS_ORIGIN],
        // Google's only Ads scope also allows changes, so the source reaches
        // nothing but the read-only report endpoint of its one account.
        access: ({ customerId, loginCustomerId }) => ({
            rules: [readRule('POST', getGoogleAdsSearchPath(customerId))],
            headers: loginCustomerId
                ? { 'login-customer-id': loginCustomerId }
                : null,
        }),
        checkAuth: (connection) => assertGoogleSignIn(LABEL, connection),
        validate: ({ customerId, loginCustomerId }) => {
            if (
                !GOOGLE_ADS_CUSTOMER_ID.test(customerId) ||
                (loginCustomerId !== null &&
                    !GOOGLE_ADS_CUSTOMER_ID.test(loginCustomerId))
            ) {
                throw new ParameterError(
                    'Google Ads customer IDs must be 10 digits without dashes',
                );
            }
        },
        describeTarget: ({ settings: { customerId }, targetLabel }) =>
            targetLabel
                ? `Google Ads account "${targetLabel}" (ID ${customerId})`
                : `Google Ads account ${customerId}`,
    };

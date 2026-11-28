import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import { readRule, type LiveConnection } from '../../sdk';
import { assertGoogleSignIn } from '../google/signIn';
import { GA4_DATA_ORIGIN, getGa4MetadataPath, getGa4ReportPath } from './api';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.GA4];
const LABEL = CATALOG.messageLabel;
const GA4_PROPERTY_ID = /^\d{1,20}$/;

export const ga4Connection: LiveConnection<ApiConnectorType.GA4> = {
    settings: CATALOG.settings,
    origins: [GA4_DATA_ORIGIN],
    access: ({ propertyId }) => ({
        rules: [
            readRule('POST', getGa4ReportPath(propertyId)),
            readRule('GET', getGa4MetadataPath(propertyId)),
        ],
    }),
    checkAuth: (connection) => assertGoogleSignIn(LABEL, connection),
    validate: ({ propertyId }) => {
        if (!GA4_PROPERTY_ID.test(propertyId)) {
            throw new ParameterError('The GA4 property ID must be a number');
        }
    },
    describeTarget: ({ settings: { propertyId }, targetLabel }) =>
        targetLabel
            ? `Google Analytics property "${targetLabel}" (ID ${propertyId})`
            : `Google Analytics property ${propertyId}`,
};

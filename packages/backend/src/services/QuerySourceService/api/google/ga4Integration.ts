import { ApiConnectorType, ParameterError } from '@lightdash/common';
import { z } from 'zod';
import { getIsoDateInTimeZone } from '../apiDateRange';
import {
    API_SOURCE_RESPONSE_MAX_BYTES,
    assertApiSourceOrigin,
    type ApiSourceIntegration,
} from '../ApiSourceIntegration';
import { compileGa4Query } from './ga4Compiler';
import {
    GA4_CAPABILITIES,
    GA4_DATA_ORIGIN,
    Ga4Connector,
    getGa4MetadataPath,
    getGa4ReportPath,
} from './Ga4Connector';
import {
    GA4_REPORT_EXPLORE,
    GA4_SEMANTIC_LAYER_VERSION,
    withGa4MetadataFields,
} from './ga4SemanticLayer';
import { assertGoogleSignIn } from './googleSignIn';

const GA4_TIMEOUT_MS = 30_000;
const GA4_PROPERTY_ID = /^\d{1,20}$/;
const LABEL = 'Google Analytics';

export const ga4Integration: ApiSourceIntegration<ApiConnectorType.GA4> = {
    connector: ApiConnectorType.GA4,
    settingsSchema: z.object({
        connector: z.literal(ApiConnectorType.GA4),
        propertyId: z.string(),
    }),
    baseLayer: {
        baseVersion: GA4_SEMANTIC_LAYER_VERSION,
        capabilities: GA4_CAPABILITIES,
        definitions: [GA4_REPORT_EXPLORE],
        plannedModelNames: ['ecommerce'],
    },
    getAccessRules: ({ propertyId }) => ({
        allowedPathPrefixes: [
            getGa4ReportPath(propertyId),
            getGa4MetadataPath(propertyId),
        ],
        // GET reads the property metadata the semantic layer scans
        allowedMethods: ['POST', 'GET'],
        allowedContentTypes: ['application/json'],
        timeoutMs: GA4_TIMEOUT_MS,
        responseMaxBytes: API_SOURCE_RESPONSE_MAX_BYTES,
    }),
    validateConnection: ({ apiSource, type, origin, oauthTokenUrl }) => {
        if (!GA4_PROPERTY_ID.test(apiSource.propertyId)) {
            throw new ParameterError('The GA4 property ID must be a number');
        }
        assertApiSourceOrigin(LABEL, origin, GA4_DATA_ORIGIN);
        assertGoogleSignIn(LABEL, { type, oauthTokenUrl });
    },
    createConnector: ({ propertyId }, send) => {
        const connector = new Ga4Connector({ propertyId, send });
        return {
            connector,
            scan: async () => ({ ga4Metadata: await connector.getMetadata() }),
        };
    },
    compile: ({ explore, metricQuery, timezone, now }) =>
        compileGa4Query({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, timezone),
        }),
    withScannedFields: (definition, scan) =>
        withGa4MetadataFields(definition, scan.ga4Metadata),
};

import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { defineLiveIntegration } from '../../sdk';
import { airtableConnection } from './connection';
import { airtableModel } from './model';
import { airtableQuery } from './query';
import { airtableSpec } from './spec';

export const airtableIntegration = defineLiveIntegration({
    connector: ApiConnectorType.AIRTABLE,
    label: LIVE_INTEGRATION_CATALOG[ApiConnectorType.AIRTABLE].messageLabel,
    kind: 'records',
    connection: airtableConnection,
    model: airtableModel,
    query: airtableQuery,
    spec: airtableSpec,
});

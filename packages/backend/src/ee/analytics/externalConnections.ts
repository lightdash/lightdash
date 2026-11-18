import {
    type ApiConnectorType,
    type ExternalConnectionKind,
    type ExternalConnectionMethod,
    type LiveSourceErrorOrigin,
} from '@lightdash/common';
import { Track as AnalyticsTrack } from '@rudderstack/rudder-sdk-node';

type BaseTrack = Omit<AnalyticsTrack, 'context'>;

type ExternalConnectionBaseProperties = {
    organizationId: string;
    projectId: string;
    externalConnectionUuid: string;
};

type ExternalConnectionKindProperties = {
    connectionKind: ExternalConnectionKind;
    integration: ApiConnectorType | null;
};

export type ExternalConnectionEvent = BaseTrack &
    (
        | {
              event: 'external_connection.created';
              properties: ExternalConnectionBaseProperties &
                  ExternalConnectionKindProperties & {
                      authType: string;
                  };
          }
        | {
              event: 'external_connection.updated';
              properties: ExternalConnectionBaseProperties &
                  ExternalConnectionKindProperties;
          }
        | {
              event: 'external_connection.deleted';
              properties: ExternalConnectionBaseProperties &
                  ExternalConnectionKindProperties;
          }
        | {
              event: 'external_connection.secret_rotated';
              properties: ExternalConnectionBaseProperties;
          }
        | {
              event: 'external_connection.linked';
              properties: ExternalConnectionBaseProperties & {
                  appUuid: string;
                  alias: string;
              };
          }
        | {
              event: 'external_connection.unlinked';
              properties: ExternalConnectionBaseProperties & {
                  appUuid: string;
                  alias: string;
              };
          }
        | {
              /** One finished live data source query: how many upstream API calls it made, whether a stored result answered it, and how it ended. */
              event: 'live_source.query_finished';
              properties: ExternalConnectionBaseProperties & {
                  integration: ApiConnectorType | null;
                  /** Joins the query's `live_source.http_call` events. */
                  queryUuid: string;
                  context: string;
                  outcome: string;
                  /** Who failed; null when the query succeeded. */
                  errorOrigin: LiveSourceErrorOrigin | null;
                  errorCode: string | null;
                  /** True when a stored result answered the query and the integration wasn't called. */
                  cacheHit: boolean;
                  /** Upstream API calls made; 0 when the result was reused. */
                  apiCalls: number;
                  providerStatus: number | null;
                  durationMs: number;
                  rowCount: number | null;
                  columnCount: number | null;
                  truncated: boolean | null;
                  responseBytes: number;
              };
          }
        | {
              /** One HTTP call a live data source query made to its integration; sent with the query's `live_source.query_finished`. */
              event: 'live_source.http_call';
              properties: ExternalConnectionBaseProperties & {
                  integration: ApiConnectorType | null;
                  queryUuid: string;
                  /** 1 for the query's first call, counting up. */
                  sequence: number;
                  method: string;
                  /** The path with identifiers as placeholders, e.g. /repos/{owner}/{repo}/stats/contributors; never the raw path. */
                  endpoint: string;
                  /** Null when no response arrived. */
                  providerStatus: number | null;
                  /** Rows in this call's response; null when it failed or got no response. */
                  rowCount: number | null;
                  responseBytes: number;
                  durationMs: number;
              };
          }
        | {
              event: 'external_connection.fetch';
              properties: {
                  organizationId: string;
                  projectId: string;
                  appUuid: string;
                  externalConnectionUuid: string;
                  connectionAlias: string;
                  method: ExternalConnectionMethod;
                  path: string;
                  status: number | null;
                  outcome:
                      | 'ok'
                      | 'rejected'
                      | 'rate_limited'
                      | 'upstream_error';
                  durationMs: number;
                  requestBytes: number;
                  responseBytes: number;
              };
          }
    );

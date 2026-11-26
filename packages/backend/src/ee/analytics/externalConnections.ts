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
              /** A limit of an hour or longer filled: sent as it fills, not for each call refused after. */
              event: 'live_source.rate_limit_reached';
              properties: ExternalConnectionBaseProperties & {
                  integration: ApiConnectorType | null;
                  bucket: string;
                  windowMs: number;
                  limit: number;
                  isSetByAdmin: boolean;
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

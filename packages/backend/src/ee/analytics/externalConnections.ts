import {
    type ApiConnectorType,
    type ExternalConnectionKind,
    type ExternalConnectionMethod,
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
    connector: ApiConnectorType | null;
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

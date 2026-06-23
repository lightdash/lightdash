import { Track as AnalyticsTrack } from '@rudderstack/rudder-sdk-node';

type BaseTrack = Omit<AnalyticsTrack, 'context'>;

type ExternalConnectionBaseProperties = {
    organizationId: string;
    projectId: string;
    externalConnectionUuid: string;
};

export type ExternalConnectionEvent = BaseTrack &
    (
        | {
              event: 'external_connection.created';
              properties: ExternalConnectionBaseProperties & {
                  authType: string;
              };
          }
        | {
              event: 'external_connection.updated';
              properties: ExternalConnectionBaseProperties;
          }
        | {
              event: 'external_connection.deleted';
              properties: ExternalConnectionBaseProperties;
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
              userId: string;
              properties: {
                  organizationId: string;
                  projectId: string;
                  appUuid: string;
                  externalConnectionUuid: string;
                  connectionAlias: string;
                  method: 'GET' | 'POST';
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

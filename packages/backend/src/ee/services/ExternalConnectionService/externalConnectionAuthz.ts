import { subject } from '@casl/ability';
import {
    type ExternalConnection,
    type ExternalConnectionApiSource,
    type ExternalConnectionKind,
} from '@lightdash/common';

type ExternalConnectionAuthorizationContext = Pick<
    ExternalConnection,
    'organizationUuid' | 'projectUuid' | 'allowDataAppBuilderLinking'
>;

/** The data app connection subject; live data sources use `LiveSource` instead. */
export const getExternalConnectionSubject = (
    connection: ExternalConnectionAuthorizationContext,
) =>
    subject('ExternalConnection', {
        organizationUuid: connection.organizationUuid,
        projectUuid: connection.projectUuid,
        allowDataAppBuilderLinking:
            connection.allowDataAppBuilderLinking ?? false,
    });

/** A stored connection's kind; rows from older servers fall back to whether they have an API source. */
export const getConnectionKind = (connection: {
    kind?: ExternalConnectionKind;
    apiSource?: ExternalConnectionApiSource | null;
}): ExternalConnectionKind =>
    connection.kind ?? (connection.apiSource ? 'live_source' : 'data_app');

/**
 * The kind a create or test request asks for. Only its API source decides it:
 * a `kind` in the body is never trusted, since it picks the permission check.
 */
export const getRequestedConnectionKind = (request: {
    apiSource?: ExternalConnectionApiSource | null;
}): ExternalConnectionKind => (request.apiSource ? 'live_source' : 'data_app');

/**
 * The subject a connection's permission checks use, chosen by its kind. Live
 * data sources check `LiveSource`, which ignores data app linking; data app
 * connections check `ExternalConnection` as before.
 */
export const getConnectionSubject = (
    kind: ExternalConnectionKind,
    connection: ExternalConnectionAuthorizationContext,
) =>
    kind === 'live_source'
        ? subject('LiveSource', {
              organizationUuid: connection.organizationUuid,
              projectUuid: connection.projectUuid,
          })
        : getExternalConnectionSubject(connection);

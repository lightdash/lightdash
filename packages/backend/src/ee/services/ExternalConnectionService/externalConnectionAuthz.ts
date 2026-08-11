import { subject } from '@casl/ability';
import { type ExternalConnection } from '@lightdash/common';

type ExternalConnectionAuthorizationContext = Pick<
    ExternalConnection,
    'organizationUuid' | 'projectUuid' | 'allowDataAppBuilderLinking'
>;

export const getExternalConnectionSubject = (
    connection: ExternalConnectionAuthorizationContext,
) =>
    subject('ExternalConnection', {
        organizationUuid: connection.organizationUuid,
        projectUuid: connection.projectUuid,
        allowDataAppBuilderLinking:
            connection.allowDataAppBuilderLinking ?? false,
    });

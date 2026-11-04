import {
    type ScanApiSourceSchemaJobPayload,
    type SessionUser,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account';
import { toFailedScan } from '../../../services/QuerySourceService/api/posthog/postHogSchemaScan';
import { type UserService } from '../../../services/UserService';
import { type ExternalConnectionModel } from '../../models/ExternalConnectionModel';
import { type ExternalConnectionService } from '../../services/ExternalConnectionService/ExternalConnectionService';

type Dependencies = {
    userService: Pick<UserService, 'getSessionByUserUuidAndOrg'>;
    externalConnectionService: Pick<
        ExternalConnectionService,
        'scanApiSourceSchema'
    >;
    externalConnectionModel: Pick<
        ExternalConnectionModel,
        'setApiSourceSchema'
    >;
};

/** Scans as the user who saved the connection, so the scan has the same access they do. */
export const scanApiSourceSchema =
    (deps: Dependencies) =>
    async (payload: ScanApiSourceSchemaJobPayload): Promise<void> => {
        let user: SessionUser;
        try {
            user = await deps.userService.getSessionByUserUuidAndOrg(
                payload.userUuid,
                payload.organizationUuid,
            );
        } catch (error) {
            await deps.externalConnectionModel.setApiSourceSchema(
                payload.externalConnectionUuid,
                toFailedScan(error),
            );
            throw error;
        }
        await deps.externalConnectionService.scanApiSourceSchema(
            fromSession(user),
            payload.projectUuid,
            payload.externalConnectionUuid,
        );
    };

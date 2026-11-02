import {
    assertIsAccountWithOrg,
    FeatureFlags,
    FeatureNotEnabledError,
    type BigqueryWorkloadIdentity,
    type RegisteredAccount,
    type UUID,
} from '@lightdash/common';
import { type FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../models/ProjectModel/ProjectModel';
import { type BigqueryWorkloadIdentityResolver } from '../utils/googleIdentity/BigqueryWorkloadIdentityResolver';
import { assertCanConfigureConnectionIdentity } from './assertCanConfigureConnectionIdentity';
import { BaseService } from './BaseService';

type BigqueryWorkloadIdentityServiceArguments = {
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    projectModel: Pick<ProjectModel, 'getSummary'>;
    bigqueryWorkloadIdentityResolver: Pick<
        BigqueryWorkloadIdentityResolver,
        'getSubject'
    >;
};

export class BigqueryWorkloadIdentityService extends BaseService {
    constructor(
        private readonly dependencies: BigqueryWorkloadIdentityServiceArguments,
    ) {
        super();
    }

    async getIdentity(
        account: RegisteredAccount,
        projectUuid?: UUID,
    ): Promise<BigqueryWorkloadIdentity> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        await assertCanConfigureConnectionIdentity({
            ability: this.createAuditedAbility(account),
            organizationUuid,
            projectModel: this.dependencies.projectModel,
            projectUuid,
        });
        const { enabled } = await this.dependencies.featureFlagModel.get({
            user: { organizationUuid },
            featureFlagId: FeatureFlags.BigqueryWorkloadIdentityAuth,
        });
        if (!enabled) {
            throw new FeatureNotEnabledError(
                FeatureFlags.BigqueryWorkloadIdentityAuth,
            );
        }

        return {
            issuer: 'https://accounts.google.com',
            subject:
                (await this.dependencies.bigqueryWorkloadIdentityResolver.getSubject()) ??
                null,
        };
    }
}

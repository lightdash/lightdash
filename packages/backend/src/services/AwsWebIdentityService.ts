import {
    Account,
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    AwsWebIdentityAudience,
    ForbiddenError,
} from '@lightdash/common';
import { LightdashConfig } from '../config/parseConfig';
import { AwsWebIdentityAudienceModel } from '../models/AwsWebIdentityAudienceModel';
import { BaseService } from './BaseService';

type AwsWebIdentityServiceArguments = {
    lightdashConfig: LightdashConfig;
    awsWebIdentityAudienceModel: AwsWebIdentityAudienceModel;
};

export class AwsWebIdentityService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly awsWebIdentityAudienceModel: AwsWebIdentityAudienceModel;

    constructor({
        lightdashConfig,
        awsWebIdentityAudienceModel,
    }: AwsWebIdentityServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.awsWebIdentityAudienceModel = awsWebIdentityAudienceModel;
    }

    /**
     * An audience only works for connections in the organization it was
     * generated for, and only once a connection the user can edit names it,
     * so any member of the organization can generate one.
     */
    async createAudience(account: Account): Promise<AwsWebIdentityAudience> {
        if (!this.lightdashConfig.athenaWarehouseWebIdentityAuth.enabled) {
            throw new ForbiddenError(
                'Web identity authentication is not enabled on this Lightdash instance',
            );
        }
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        const audience = await this.awsWebIdentityAudienceModel.create(
            account.organization.organizationUuid,
            account.user.userUuid,
        );
        return { audience };
    }
}

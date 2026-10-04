import {
    Account,
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    AwsWebIdentity,
    AwsWebIdentityAudience,
    ForbiddenError,
} from '@lightdash/common';
import { LightdashConfig } from '../config/parseConfig';
import { AwsWebIdentityAudienceModel } from '../models/AwsWebIdentityAudienceModel';
import { type AwsWebIdentityResolver } from '../utils/awsWebIdentity/AwsWebIdentityResolver';
import { AWS_WEB_IDENTITY_MESSAGES } from '../utils/awsWebIdentity/messages';
import { BaseService } from './BaseService';

type AwsWebIdentityServiceArguments = {
    lightdashConfig: LightdashConfig;
    awsWebIdentityAudienceModel: AwsWebIdentityAudienceModel;
    awsWebIdentityResolver: AwsWebIdentityResolver;
};

export class AwsWebIdentityService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly awsWebIdentityAudienceModel: AwsWebIdentityAudienceModel;

    private readonly awsWebIdentityResolver: AwsWebIdentityResolver;

    constructor({
        lightdashConfig,
        awsWebIdentityAudienceModel,
        awsWebIdentityResolver,
    }: AwsWebIdentityServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.awsWebIdentityAudienceModel = awsWebIdentityAudienceModel;
        this.awsWebIdentityResolver = awsWebIdentityResolver;
    }

    private assertEnabled() {
        if (!this.lightdashConfig.athenaWarehouseWebIdentityAuth.enabled) {
            throw new ForbiddenError(AWS_WEB_IDENTITY_MESSAGES.notEnabled);
        }
    }

    /** This instance's identity, to put in a role's trust policy. */
    async getIdentity(account: Account): Promise<AwsWebIdentity> {
        this.assertEnabled();
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        return {
            subject: (await this.awsWebIdentityResolver.getSubject()) ?? null,
        };
    }

    /**
     * An audience only works for connections in the organization it was
     * generated for, and only once a connection the user can edit names it,
     * so any member of the organization can generate one.
     */
    async createAudience(account: Account): Promise<AwsWebIdentityAudience> {
        this.assertEnabled();
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        const audience = await this.awsWebIdentityAudienceModel.create(
            account.organization.organizationUuid,
            account.user.userUuid,
        );
        return {
            audience,
            subject: (await this.awsWebIdentityResolver.getSubject()) ?? null,
        };
    }
}

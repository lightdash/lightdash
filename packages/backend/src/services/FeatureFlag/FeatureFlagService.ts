import { subject } from '@casl/ability';
import {
    ForbiddenError,
    LightdashUser,
    type SessionUser,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { BaseService } from '../BaseService';

type FeatureFlagServiceArguments = {
    lightdashConfig: LightdashConfig;
    featureFlagModel: FeatureFlagModel;
};

export class FeatureFlagService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly featureFlagModel: FeatureFlagModel;

    constructor(args: FeatureFlagServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.featureFlagModel = args.featureFlagModel;
    }

    get({
        user,
        featureFlagId,
    }: {
        user?: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>;
        featureFlagId: string;
    }) {
        return this.featureFlagModel.get({ user, featureFlagId });
    }

    ensureOrganizationOverrideEnabled({
        user,
        featureFlagId,
    }: {
        user: SessionUser;
        featureFlagId: string;
    }) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User is not part of an organization');
        }
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        return this.featureFlagModel.ensureOrganizationOverrideEnabled(
            featureFlagId,
            organizationUuid,
        );
    }
}

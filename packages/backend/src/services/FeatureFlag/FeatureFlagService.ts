import { LightdashUser } from '@lightdash/common';
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
        user?: Pick<
            LightdashUser,
            'userUuid' | 'organizationUuid' | 'organizationName'
        >;
        featureFlagId: string;
    }) {
        return this.featureFlagModel.get({ user, featureFlagId });
    }
}

import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { EmailModel } from '../../../models/EmailModel';
import { GroupsModel } from '../../../models/GroupsModel';
import { OrganizationMemberProfileModel } from '../../../models/OrganizationMemberProfileModel';
import { UserModel } from '../../../models/UserModel';
import { CommercialFeatureFlagModel } from '../../models/CommercialFeatureFlagModel';
import { ServiceAccountModel } from '../../models/ServiceAccountModel';
import { ScimService } from './ScimService';

export const ScimServiceArgumentsMock: ConstructorParameters<
    typeof ScimService
>[0] = {
    lightdashConfig: lightdashConfigMock,
    organizationMemberProfileModel: {} as OrganizationMemberProfileModel,
    userModel: {} as UserModel,
    emailModel: {} as EmailModel,
    analytics: {} as LightdashAnalytics,
    groupsModel: {} as GroupsModel,
    serviceAccountModel: {} as ServiceAccountModel,
    commercialFeatureFlagModel: {} as CommercialFeatureFlagModel,
};

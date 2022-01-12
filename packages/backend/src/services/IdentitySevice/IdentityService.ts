import { OpenIdIdentityModel } from '../../models/OpenIdIdentities';
import { UserModel } from '../../models/UserModel';

type IdentityServiceDependencies = {
    userModel: UserModel;

    openIdIdentityModel: OpenIdIdentityModel;
};

export class IdentityService {
    userModel: UserModel;

    openIdIdentityModel: OpenIdIdentityModel;

    constructor({
        userModel,
        openIdIdentityModel,
    }: IdentityServiceDependencies) {
        this.userModel = userModel;
        this.openIdIdentityModel = openIdIdentityModel;
    }

    async login(issuer: string, subject: string) {
        const identity = await this.openIdIdentityModel.getIdentityByOpenId(
            issuer,
            subject,
        );
    }
}

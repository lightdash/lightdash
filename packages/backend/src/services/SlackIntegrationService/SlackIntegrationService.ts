import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';

type SlackIntegrationServiceArguments = {
    slackAuthenticationModel: SlackAuthenticationModel;
};

export class SlackIntegrationService {
    private readonly slackAuthenticationModel: SlackAuthenticationModel;

    constructor(args: SlackIntegrationServiceArguments) {
        this.slackAuthenticationModel = args.slackAuthenticationModel;
    }

    async getInstallationFromOrganizationUuid(orgUuid: string) {
        return this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
            orgUuid,
        );
    }

    async deleteInstallationFromOrganizationUuid(orgUuid: string) {
        return this.slackAuthenticationModel.deleteInstallationFromOrganizationUuid(
            orgUuid,
        );
    }
}

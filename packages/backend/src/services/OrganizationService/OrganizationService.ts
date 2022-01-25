import { subject } from '@casl/ability';
import {
    LightdashMode,
    OnbordingRecord,
    Organisation,
    OrganizationMemberProfile,
    OrganizationMemberProfileUpdate,
    OrganizationProject,
    SessionUser,
} from 'common';
import { analytics } from '../../analytics/client';
import { lightdashConfig } from '../../config/lightdashConfig';
import { ForbiddenError, NotExistsError } from '../../errors';
import { InviteLinkModel } from '../../models/InviteLinkModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';

type OrganizationServiceDependencies = {
    organizationModel: OrganizationModel;
    projectModel: ProjectModel;
    onboardingModel: OnboardingModel;
    inviteLinkModel: InviteLinkModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
};

export class OrganizationService {
    private readonly organizationModel: OrganizationModel;

    private readonly projectModel: ProjectModel;

    private readonly onboardingModel: OnboardingModel;

    private readonly inviteLinkModel: InviteLinkModel;

    private readonly organizationMemberProfileModel: OrganizationMemberProfileModel;

    constructor({
        organizationModel,
        projectModel,
        onboardingModel,
        inviteLinkModel,
        organizationMemberProfileModel,
    }: OrganizationServiceDependencies) {
        this.organizationModel = organizationModel;
        this.projectModel = projectModel;
        this.onboardingModel = onboardingModel;
        this.inviteLinkModel = inviteLinkModel;
        this.organizationMemberProfileModel = organizationMemberProfileModel;
    }

    async get(user: SessionUser): Promise<Organisation> {
        return this.organizationModel.get(user.organizationUuid);
    }

    async updateOrg(
        { organizationUuid, organizationName, userUuid }: SessionUser,
        data: Organisation,
    ): Promise<void> {
        if (
            user.ability.cannot(
                'update',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        const org = await this.organizationModel.update(organizationUuid, data);
        analytics.track({
            userId: userUuid,
            event: 'organization.updated',
            organizationId: organizationUuid,
            properties: {
                type:
                    lightdashConfig.mode === LightdashMode.CLOUD_BETA
                        ? 'cloud'
                        : 'self-hosted',
                organizationId: organizationUuid,
                organizationName: org.name,
            },
        });
    }

    async hasInvitedUser(user: SessionUser): Promise<boolean> {
        return (
            (await this.inviteLinkModel.hasActiveInvites()) ||
            (await this.getUsers(user)).length > 1
        );
    }

    async getUsers(user: SessionUser): Promise<OrganizationMemberProfile[]> {
        const { organizationUuid } = user;
        if (user.ability.cannot('view', 'OrganizationMemberProfile')) {
            throw new ForbiddenError();
        }
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }

        const members =
            await this.organizationMemberProfileModel.getOrganizationMembers(
                organizationUuid,
            );
        return members.filter((member) =>
            user.ability.can(
                'view',
                subject('OrganizationMemberProfile', member),
            ),
        );
    }

    async getProjects(user: SessionUser): Promise<OrganizationProject[]> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        return this.projectModel.getAllByOrganizationUuid(organizationUuid);
    }

    async getOnboarding(user: SessionUser): Promise<OnbordingRecord> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        return this.onboardingModel.getByOrganizationUuid(organizationUuid);
    }

    async setOnboardingSuccessDate(user: SessionUser): Promise<void> {
        const { shownSuccessAt } = await this.getOnboarding(user);
        if (shownSuccessAt) {
            throw new NotExistsError('Can not override "shown success" date');
        }
        return this.onboardingModel.update(user.organizationUuid, {
            shownSuccessAt: new Date(),
        });
    }

    async updateMember(
        authenticatedUser: SessionUser,
        memberUserUuid: string,
        data: OrganizationMemberProfileUpdate,
    ): Promise<OrganizationMemberProfile> {
        const { organizationUuid } = authenticatedUser;
        if (
            authenticatedUser.ability.cannot(
                'update',
                subject('OrganizationMemberProfile', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        // Race condition between check and delete
        const [admin, ...remainingAdmins] =
            await this.organizationMemberProfileModel.getOrganizationAdmins(
                organizationUuid,
            );
        if (remainingAdmins.length === 0 && admin.userUuid === memberUserUuid) {
            throw new ForbiddenError(
                'Organization must have at least one admin',
            );
        }
        return this.organizationMemberProfileModel.updateOrganizationMember(
            organizationUuid,
            memberUserUuid,
            data,
        );
    }
}

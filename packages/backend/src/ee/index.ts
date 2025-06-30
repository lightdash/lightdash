import { ForbiddenError } from '@lightdash/common';
import express, { Express } from 'express';
import { AppArguments } from '../App';
import { lightdashConfig } from '../config/lightdashConfig';
import Logger from '../logging/logger';
import { AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import { OrganizationService } from '../services/OrganizationService/OrganizationService';
import { ProjectService } from '../services/ProjectService/ProjectService';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import LicenseClient from './clients/License/LicenseClient';
import OpenAi from './clients/OpenAi';
import { CommercialSlackBot } from './clients/Slack/SlackBot';
import { AiAgentModel } from './models/AiAgentModel';
import { CommercialCatalogModel } from './models/CommercialCatalogModel';
import { CommercialFeatureFlagModel } from './models/CommercialFeatureFlagModel';
import { CommercialSlackAuthenticationModel } from './models/CommercialSlackAuthenticationModel';
import { DashboardSummaryModel } from './models/DashboardSummaryModel';
import { EmbedModel } from './models/EmbedModel';
import { ServiceAccountModel } from './models/ServiceAccountModel';
import { CommercialSchedulerClient } from './scheduler/SchedulerClient';
import { CommercialSchedulerWorker } from './scheduler/SchedulerWorker';
import { AiAgentService } from './services/AiAgentService';
import { AiService } from './services/AiService/AiService';
import { CommercialCacheService } from './services/CommercialCacheService';
import { CommercialCatalogService } from './services/CommercialCatalogService';
import { CommercialSlackIntegrationService } from './services/CommercialSlackIntegrationService';
import { EmbedService } from './services/EmbedService/EmbedService';
import { ScimService } from './services/ScimService/ScimService';
import { ServiceAccountService } from './services/ServiceAccountService/ServiceAccountService';
import { SupportService } from './services/SupportService/SupportService';

type EnterpriseAppArguments = Pick<
    AppArguments,
    | 'schedulerWorkerFactory'
    | 'clientProviders'
    | 'serviceProviders'
    | 'modelProviders'
    | 'customExpressMiddlewares'
    | 'slackBotFactory'
>;

export async function getEnterpriseAppArguments(): Promise<EnterpriseAppArguments> {
    if (!lightdashConfig.license.licenseKey) {
        return {};
    }

    const licenseClient = new LicenseClient({});

    const license = await licenseClient.get(lightdashConfig.license.licenseKey);
    if (license.isValid) {
        Logger.info(
            `Enterprise license for ${lightdashConfig.siteUrl} is valid.`,
        );
    } else {
        throw new ForbiddenError(
            `Enterprise license for ${lightdashConfig.siteUrl} ${license.detail} [${license.code}]`,
        );
    }

    return {
        serviceProviders: {
            embedService: ({ repository, context, models }) =>
                new EmbedService({
                    analytics: context.lightdashAnalytics,
                    lightdashConfig: context.lightdashConfig,
                    encryptionUtil: new EncryptionUtil({
                        lightdashConfig: context.lightdashConfig,
                    }),
                    projectService: repository.getProjectService(),
                    dashboardModel: models.getDashboardModel(),
                    embedModel: models.getEmbedModel(),
                    projectModel: models.getProjectModel(),
                    savedChartModel: models.getSavedChartModel(),
                    userAttributesModel: models.getUserAttributesModel(),
                    featureFlagModel: models.getFeatureFlagModel(),
                    organizationModel: models.getOrganizationModel(),
                }),
            catalogService: ({ context, models }) =>
                new CommercialCatalogService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    projectModel: models.getProjectModel(),
                    userAttributesModel: models.getUserAttributesModel(),
                    savedChartModel: models.getSavedChartModel(),
                    spaceModel: models.getSpaceModel(),
                    catalogModel:
                        models.getCatalogModel() as CommercialCatalogModel,
                    tagsModel: models.getTagsModel(),
                }),
            aiService: ({ repository, context, models, clients }) =>
                new AiService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    dashboardModel: models.getDashboardModel(),
                    dashboardSummaryModel: models.getDashboardSummaryModel(),
                    projectService: repository.getProjectService(),
                    openAi: new OpenAi(), // TODO This should go in client repository as soon as it is available
                }),
            aiAgentService: ({ models, repository, clients, context }) =>
                new AiAgentService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    userModel: models.getUserModel(),
                    aiAgentModel: models.getAiAgentModel(),
                    featureFlagService: repository.getFeatureFlagService(),
                    slackClient: clients.getSlackClient(),
                    schedulerClient:
                        clients.getSchedulerClient() as CommercialSchedulerClient,
                    projectService: repository.getProjectService(),
                    catalogService:
                        repository.getCatalogService() as CommercialCatalogService,
                    asyncQueryService: repository.getAsyncQueryService(),
                }),
            scimService: ({ models, context }) =>
                new ScimService({
                    lightdashConfig: context.lightdashConfig,
                    organizationMemberProfileModel:
                        models.getOrganizationMemberProfileModel(),
                    userModel: models.getUserModel(),
                    emailModel: models.getEmailModel(),
                    analytics: context.lightdashAnalytics,
                    groupsModel: models.getGroupsModel(),
                    serviceAccountModel: models.getServiceAccountModel(),
                    commercialFeatureFlagModel:
                        models.getFeatureFlagModel() as CommercialFeatureFlagModel,
                }),
            serviceAccountService: ({ models, context }) =>
                new ServiceAccountService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    serviceAccountModel: models.getServiceAccountModel(),
                    commercialFeatureFlagModel:
                        models.getFeatureFlagModel() as CommercialFeatureFlagModel,
                }),
            slackIntegrationService: ({ models, context, clients }) =>
                new CommercialSlackIntegrationService({
                    slackAuthenticationModel:
                        models.getSlackAuthenticationModel() as CommercialSlackAuthenticationModel,
                    analytics: context.lightdashAnalytics,
                    slackClient: clients.getSlackClient(),
                    aiAgentModel: models.getAiAgentModel(),
                }),
            supportService: ({ models, context, repository, clients }) =>
                new SupportService({
                    analytics: context.lightdashAnalytics,
                    projectModel: models.getProjectModel(),
                    savedChartModel: models.getSavedChartModel(),
                    dashboardModel: models.getDashboardModel(),
                    spaceModel: models.getSpaceModel(),
                    s3Client: clients.getS3Client(),
                    organizationModel: models.getOrganizationModel(),
                    unfurlService: repository.getUnfurlService(),
                    projectService: repository.getProjectService(),
                    lightdashConfig: context.lightdashConfig,
                }),
            projectService: ({ models, context, clients, utils }) =>
                new ProjectService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    projectModel: models.getProjectModel(),
                    onboardingModel: models.getOnboardingModel(),
                    savedChartModel: models.getSavedChartModel(),
                    jobModel: models.getJobModel(),
                    emailClient: clients.getEmailClient(),
                    spaceModel: models.getSpaceModel(),
                    sshKeyPairModel: models.getSshKeyPairModel(),
                    userAttributesModel: models.getUserAttributesModel(),
                    s3CacheClient: clients.getS3CacheClient(),
                    analyticsModel: models.getAnalyticsModel(),
                    dashboardModel: models.getDashboardModel(),
                    userWarehouseCredentialsModel:
                        models.getUserWarehouseCredentialsModel(),
                    warehouseAvailableTablesModel:
                        models.getWarehouseAvailableTablesModel(),
                    emailModel: models.getEmailModel(),
                    schedulerClient: clients.getSchedulerClient(),
                    downloadFileModel: models.getDownloadFileModel(),
                    s3Client: clients.getS3Client(),
                    groupsModel: models.getGroupsModel(),
                    tagsModel: models.getTagsModel(),
                    catalogModel: models.getCatalogModel(),
                    contentModel: models.getContentModel(),
                    encryptionUtil: utils.getEncryptionUtil(),
                    userModel: models.getUserModel(),
                }),
            organizationService: ({ models, context, repository }) =>
                new OrganizationService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    organizationModel: models.getOrganizationModel(),
                    projectModel: models.getProjectModel(),
                    onboardingModel: models.getOnboardingModel(),
                    inviteLinkModel: models.getInviteLinkModel(),
                    organizationMemberProfileModel:
                        models.getOrganizationMemberProfileModel(),
                    userModel: models.getUserModel(),
                    organizationAllowedEmailDomainsModel:
                        models.getOrganizationAllowedEmailDomainsModel(),
                    groupsModel: models.getGroupsModel(),
                    personalAccessTokenModel:
                        models.getPersonalAccessTokenModel(),
                    emailModel: models.getEmailModel(),
                    projectService: repository.getProjectService(),
                    serviceAccountModel: models.getServiceAccountModel(),
                }),
            asyncQueryService: ({
                models,
                context,
                clients,
                utils,
                repository,
            }) =>
                new AsyncQueryService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    projectModel: models.getProjectModel(),
                    onboardingModel: models.getOnboardingModel(),
                    savedChartModel: models.getSavedChartModel(),
                    jobModel: models.getJobModel(),
                    emailClient: clients.getEmailClient(),
                    spaceModel: models.getSpaceModel(),
                    sshKeyPairModel: models.getSshKeyPairModel(),
                    userAttributesModel: models.getUserAttributesModel(),
                    s3CacheClient: clients.getS3CacheClient(),
                    analyticsModel: models.getAnalyticsModel(),
                    dashboardModel: models.getDashboardModel(),
                    userWarehouseCredentialsModel:
                        models.getUserWarehouseCredentialsModel(),
                    warehouseAvailableTablesModel:
                        models.getWarehouseAvailableTablesModel(),
                    emailModel: models.getEmailModel(),
                    schedulerClient: clients.getSchedulerClient(),
                    downloadFileModel: models.getDownloadFileModel(),
                    s3Client: clients.getS3Client(),
                    groupsModel: models.getGroupsModel(),
                    tagsModel: models.getTagsModel(),
                    catalogModel: models.getCatalogModel(),
                    contentModel: models.getContentModel(),
                    encryptionUtil: utils.getEncryptionUtil(),
                    userModel: models.getUserModel(),
                    queryHistoryModel: models.getQueryHistoryModel(),
                    cacheService: repository.getCacheService(),
                    savedSqlModel: models.getSavedSqlModel(),
                    storageClient: clients.getResultsFileStorageClient(),
                    csvService: repository.getCsvService(),
                }),
            cacheService: ({ models, context, clients }) =>
                new CommercialCacheService({
                    queryHistoryModel: models.getQueryHistoryModel(),
                    lightdashConfig: context.lightdashConfig,
                    storageClient: clients.getResultsFileStorageClient(),
                }),
        },
        modelProviders: {
            aiAgentModel: ({ database }) => new AiAgentModel({ database }),
            embedModel: ({ database }) => new EmbedModel({ database }),
            dashboardSummaryModel: ({ database }) =>
                new DashboardSummaryModel({ database }),
            catalogModel: ({ database }) =>
                new CommercialCatalogModel({
                    database,
                    lightdashConfig,
                    openAi: new OpenAi(), // TODO This should go in client repository as soon as it is available
                }),
            slackAuthenticationModel: ({ database }) =>
                new CommercialSlackAuthenticationModel({ database }),
            serviceAccountModel: ({ database }) =>
                new ServiceAccountModel({ database }),
            featureFlagModel: ({ database }) =>
                new CommercialFeatureFlagModel({ database, lightdashConfig }),
        },
        customExpressMiddlewares: [
            (expressApp: Express) => {
                expressApp.use(
                    express.json({
                        limit: lightdashConfig.maxPayloadSize,
                        type: ['application/scim+json'],
                    }),
                );
            },
        ],
        schedulerWorkerFactory: (context) =>
            new CommercialSchedulerWorker({
                lightdashConfig: context.lightdashConfig,
                analytics: context.analytics,
                unfurlService: context.serviceRepository.getUnfurlService(),
                csvService: context.serviceRepository.getCsvService(),
                dashboardService:
                    context.serviceRepository.getDashboardService(),
                projectService: context.serviceRepository.getProjectService(),
                schedulerService:
                    context.serviceRepository.getSchedulerService(),
                validationService:
                    context.serviceRepository.getValidationService(),
                userService: context.serviceRepository.getUserService(),
                emailClient: context.clients.getEmailClient(),
                googleDriveClient: context.clients.getGoogleDriveClient(),
                s3Client: context.clients.getS3Client(),
                schedulerClient: context.clients.getSchedulerClient(),
                slackClient: context.clients.getSlackClient(),
                aiAgentService: context.serviceRepository.getAiAgentService(),
                catalogService: context.serviceRepository.getCatalogService(),
                encryptionUtil: context.utils.getEncryptionUtil(),
                msTeamsClient: context.clients.getMsTeamsClient(),
                renameService: context.serviceRepository.getRenameService(),
                asyncQueryService:
                    context.serviceRepository.getAsyncQueryService(),
            }),
        slackBotFactory: (context) =>
            new CommercialSlackBot({
                lightdashConfig: context.lightdashConfig,
                analytics: context.analytics,
                slackAuthenticationModel:
                    context.models.getSlackAuthenticationModel() as CommercialSlackAuthenticationModel,
                unfurlService: context.serviceRepository.getUnfurlService(),
                aiAgentService: context.serviceRepository.getAiAgentService(),
                schedulerClient:
                    context.clients.getSchedulerClient() as CommercialSchedulerClient,
                aiAgentModel: context.models.getAiAgentModel(),
            }),
        clientProviders: {
            schedulerClient: ({ context, models }) =>
                new CommercialSchedulerClient({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    schedulerModel: models.getSchedulerModel(),
                }),
        },
    };
}

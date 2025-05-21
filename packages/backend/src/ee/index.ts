import { ForbiddenError } from '@lightdash/common';
import express, { Express } from 'express';
import { AppArguments } from '../App';
import { lightdashConfig } from '../config/lightdashConfig';
import Logger from '../logging/logger';
import { AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import { ProjectService } from '../services/ProjectService/ProjectService';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import LicenseClient from './clients/License/LicenseClient';
import OpenAi from './clients/OpenAi';
import { CommercialSlackBot } from './clients/Slack/SlackBot';
import { AiModel } from './models/AiModel';
import { CommercialCatalogModel } from './models/CommercialCatalogModel';
import { CommercialFeatureFlagModel } from './models/CommercialFeatureFlagModel';
import { CommercialSlackAuthenticationModel } from './models/CommercialSlackAuthenticationModel';
import { DashboardSummaryModel } from './models/DashboardSummaryModel';
import { EmbedModel } from './models/EmbedModel';
import { ScimOrganizationAccessTokenModel } from './models/ScimOrganizationAccessTokenModel';
import { CommercialSchedulerClient } from './scheduler/SchedulerClient';
import { CommercialSchedulerWorker } from './scheduler/SchedulerWorker';
import { AiAgentService } from './services/AiAgentService';
import { AiService } from './services/AiService/AiService';
import { CommercialCacheService } from './services/CommercialCacheService';
import { CommercialCatalogService } from './services/CommercialCatalogService';
import { CommercialSlackIntegrationService } from './services/CommercialSlackIntegrationService';
import { EmbedService } from './services/EmbedService/EmbedService';
import { ScimService } from './services/ScimService/ScimService';
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
                    userModel: models.getUserModel(),
                    userAttributesModel: models.getUserAttributesModel(),
                    featureFlagModel: models.getFeatureFlagModel(),
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
                    analytics: context.lightdashAnalytics,
                    dashboardModel: models.getDashboardModel(),
                    dashboardSummaryModel: models.getDashboardSummaryModel(),
                    projectService: repository.getProjectService(),
                    catalogService:
                        repository.getCatalogService() as CommercialCatalogService,
                    userModel: models.getUserModel(),
                    aiModel: models.getAiModel(),
                    projectModel: models.getProjectModel(),
                    openAi: new OpenAi(), // TODO This should go in client repository as soon as it is available
                    slackClient: clients.getSlackClient(),
                    lightdashConfig: context.lightdashConfig,
                    organizationModel: models.getOrganizationModel(),
                    slackAuthenticationModel:
                        models.getSlackAuthenticationModel() as CommercialSlackAuthenticationModel,
                    featureFlagService: repository.getFeatureFlagService(),
                }),
            aiAgentService: ({ models, repository }) =>
                new AiAgentService({
                    slackAuthenticationModel:
                        models.getSlackAuthenticationModel() as CommercialSlackAuthenticationModel,
                    featureFlagService: repository.getFeatureFlagService(),
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
                    scimOrganizationAccessTokenModel:
                        models.getScimOrganizationAccessTokenModel(),
                    commercialFeatureFlagModel:
                        models.getFeatureFlagModel() as CommercialFeatureFlagModel,
                }),
            slackIntegrationService: ({ models, context }) =>
                new CommercialSlackIntegrationService({
                    slackAuthenticationModel:
                        models.getSlackAuthenticationModel() as CommercialSlackAuthenticationModel,
                    analytics: context.lightdashAnalytics,
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
                    resultsFileModel: models.getResultsFileModel(),
                    storageClient: clients.getResultsFileStorageClient(),
                }),
            cacheService: ({ models, context, clients }) =>
                new CommercialCacheService({
                    resultsFileModel: models.getResultsFileModel(),
                    lightdashConfig: context.lightdashConfig,
                    storageClient: clients.getResultsFileStorageClient(),
                }),
        },
        modelProviders: {
            aiModel: ({ database }) => new AiModel({ database }),
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
            scimOrganizationAccessTokenModel: ({ database }) =>
                new ScimOrganizationAccessTokenModel({ database }),
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
                aiService: context.serviceRepository.getAiService(),
                semanticLayerService:
                    context.serviceRepository.getSemanticLayerService(),
                catalogService: context.serviceRepository.getCatalogService(),
                encryptionUtil: context.utils.getEncryptionUtil(),
                msTeamsClient: context.clients.getMsTeamsClient(),
                renameService: context.serviceRepository.getRenameService(),
            }),
        slackBotFactory: (context) =>
            new CommercialSlackBot({
                lightdashConfig: context.lightdashConfig,
                analytics: context.analytics,
                slackAuthenticationModel:
                    context.models.getSlackAuthenticationModel() as CommercialSlackAuthenticationModel,
                unfurlService: context.serviceRepository.getUnfurlService(),
                aiService: context.serviceRepository.getAiService(),
                schedulerClient:
                    context.clients.getSchedulerClient() as CommercialSchedulerClient,
                aiModel: context.models.getAiModel(),
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

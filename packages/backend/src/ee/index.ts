import { ForbiddenError } from '@lightdash/common';
import express, { Express } from 'express';
import { AppArguments } from '../App';
import { lightdashConfig } from '../config/lightdashConfig';
import Logger from '../logging/logger';
import { McpContextModel } from '../models/McpContextModel';
import { registerPreAggregateStream } from '../nats/natsConfig';
import { AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import { DeployService } from '../services/DeployService';
import { InstanceConfigurationService } from '../services/InstanceConfigurationService/InstanceConfigurationService';
import { ProjectService } from '../services/ProjectService/ProjectService';
import { RolesService } from '../services/RolesService/RolesService';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import LicenseClient from './clients/License/LicenseClient';
import { ManagedAgentClient } from './clients/ManagedAgentClient';
import OpenAi from './clients/OpenAi';
import { CommercialSlackClient } from './clients/Slack/SlackClient';
import { AiAgentModel } from './models/AiAgentModel';
import { AiOrganizationSettingsModel } from './models/AiOrganizationSettingsModel';
import { CommercialFeatureFlagModel } from './models/CommercialFeatureFlagModel';
import { CommercialSlackAuthenticationModel } from './models/CommercialSlackAuthenticationModel';
import { DashboardSummaryModel } from './models/DashboardSummaryModel';
import { EmbedModel } from './models/EmbedModel';
import { ManagedAgentModel } from './models/ManagedAgentModel';
import { ServiceAccountModel } from './models/ServiceAccountModel';
import { enhanceExploresForPreAggregates } from './preAggregates/enhanceExploresForPreAggregates';
import { preAggregatePostProcessor } from './preAggregates/postProcessor';
import { CommercialSchedulerClient } from './scheduler/SchedulerClient';
import { CommercialSchedulerWorker } from './scheduler/SchedulerWorker';
import { AiAgentAdminService } from './services/AiAgentAdminService';
import { AiAgentService } from './services/AiAgentService/AiAgentService';
import { AiOrganizationSettingsService } from './services/AiOrganizationSettingsService';
import { AiService } from './services/AiService/AiService';
import { AppGenerateService } from './services/AppGenerateService/AppGenerateService';
import { PreAggregateStrategy } from './services/AsyncQueryService/PreAggregateStrategy';
import { PreAggregationDuckDbClient } from './services/AsyncQueryService/PreAggregationDuckDbClient';
import { CommercialCacheService } from './services/CommercialCacheService';
import { CommercialSlackIntegrationService } from './services/CommercialSlackIntegrationService';
import { EmbedService } from './services/EmbedService/EmbedService';
import { ManagedAgentService } from './services/ManagedAgentService/ManagedAgentService';
import { McpService } from './services/McpService/McpService';
import { OrganizationWarehouseCredentialsService } from './services/OrganizationWarehouseCredentialsService';
import { ScimService } from './services/ScimService/ScimService';
import { ServiceAccountService } from './services/ServiceAccountService/ServiceAccountService';
import { CommercialSlackService } from './services/SlackService/SlackService';
import { SupportService } from './services/SupportService/SupportService';

type EnterpriseAppArguments = Pick<
    AppArguments,
    | 'schedulerWorkerFactory'
    | 'clientProviders'
    | 'serviceProviders'
    | 'modelProviders'
    | 'customExpressMiddlewares'
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

    // Register EE-specific NATS streams
    registerPreAggregateStream();

    return {
        serviceProviders: {
            appGenerateService: ({ context, models, clients, repository }) =>
                new AppGenerateService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    analyticsModel: models.getAnalyticsModel(),
                    catalogModel: models.getCatalogModel(),
                    appModel: models.getAppModel(),
                    featureFlagModel: models.getFeatureFlagModel(),
                    pinnedListModel: models.getPinnedListModel(),
                    projectModel: models.getProjectModel(),
                    schedulerClient:
                        clients.getSchedulerClient() as CommercialSchedulerClient,
                    savedChartService: repository.getSavedChartService(),
                    spacePermissionService:
                        repository.getSpacePermissionService(),
                    dashboardService: repository.getDashboardService(),
                    projectService: repository.getProjectService(),
                }),
            embedService: ({ repository, context, models }) =>
                new EmbedService({
                    analytics: context.lightdashAnalytics,
                    lightdashConfig: context.lightdashConfig,
                    encryptionUtil: new EncryptionUtil({
                        lightdashConfig: context.lightdashConfig,
                    }),
                    projectService: repository.getProjectService(),
                    asyncQueryService: repository.getAsyncQueryService(),
                    dashboardModel: models.getDashboardModel(),
                    embedModel: models.getEmbedModel(),
                    projectModel: models.getProjectModel(),
                    savedChartModel: models.getSavedChartModel(),
                    userAttributesModel: models.getUserAttributesModel(),
                    featureFlagModel: models.getFeatureFlagModel(),
                    organizationModel: models.getOrganizationModel(),
                }),
            aiService: ({ repository, context, models }) =>
                new AiService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    dashboardModel: models.getDashboardModel(),
                    dashboardSummaryModel: models.getDashboardSummaryModel(),
                    projectService: repository.getProjectService(),
                    featureFlagService: repository.getFeatureFlagService(),
                    openAi: new OpenAi(), // TODO This should go in client repository as soon as it is available
                }),
            aiAgentService: ({
                models,
                repository,
                clients,
                context,
                prometheusMetrics,
            }) =>
                new AiAgentService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    userModel: models.getUserModel(),
                    aiAgentModel: models.getAiAgentModel(),
                    changesetModel: models.getChangesetModel(),
                    catalogModel: models.getCatalogModel(),
                    groupsModel: models.getGroupsModel(),
                    featureFlagService: repository.getFeatureFlagService(),
                    slackClient: clients.getSlackClient(),
                    projectService: repository.getProjectService(),
                    catalogService: repository.getCatalogService(),
                    asyncQueryService: repository.getAsyncQueryService(),
                    userAttributesModel: models.getUserAttributesModel(),
                    searchModel: models.getSearchModel(),
                    slackAuthenticationModel:
                        models.getSlackAuthenticationModel() as CommercialSlackAuthenticationModel,
                    schedulerClient:
                        clients.getSchedulerClient() as CommercialSchedulerClient,
                    openIdIdentityModel: models.getOpenIdIdentityModel(),
                    spaceService: repository.getSpaceService(),
                    projectModel: models.getProjectModel(),
                    savedChartService: repository.getSavedChartService(),
                    aiOrganizationSettingsService:
                        repository.getAiOrganizationSettingsService(),
                    shareService: repository.getShareService(),
                    prometheusMetrics,
                }),
            aiAgentAdminService: ({ models, context }) =>
                new AiAgentAdminService({
                    aiAgentModel: models.getAiAgentModel(),
                    lightdashConfig: context.lightdashConfig,
                }),
            aiOrganizationSettingsService: ({ models, context }) =>
                new AiOrganizationSettingsService({
                    aiOrganizationSettingsModel:
                        models.getAiOrganizationSettingsModel(),
                    organizationModel: models.getOrganizationModel(),
                    commercialFeatureFlagModel:
                        models.getFeatureFlagModel() as CommercialFeatureFlagModel,
                    lightdashConfig: context.lightdashConfig,
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
                    rolesModel: models.getRolesModel(),
                    projectModel: models.getProjectModel(),
                    openIdIdentityModel: models.getOpenIdIdentityModel(),
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
                    fileStorageClient: clients.getFileStorageClient(),
                    organizationModel: models.getOrganizationModel(),
                    unfurlService: repository.getUnfurlService(),
                    projectService: repository.getProjectService(),
                    lightdashConfig: context.lightdashConfig,
                }),
            organizationWarehouseCredentialsService: ({ models, context }) =>
                new OrganizationWarehouseCredentialsService({
                    analytics: context.lightdashAnalytics,
                    organizationWarehouseCredentialsModel:
                        models.getOrganizationWarehouseCredentialsModel(),
                    userModel: models.getUserModel(),
                }),
            projectService: ({ models, context, clients, utils, repository }) =>
                new ProjectService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    projectModel: models.getProjectModel(),
                    preAggregateModel: models.getPreAggregateModel(),
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
                    natsClient: clients.getNatsClient(),
                    downloadFileModel: models.getDownloadFileModel(),
                    fileStorageClient: clients.getFileStorageClient(),
                    groupsModel: models.getGroupsModel(),
                    tagsModel: models.getTagsModel(),
                    catalogModel: models.getCatalogModel(),
                    contentModel: models.getContentModel(),
                    encryptionUtil: utils.getEncryptionUtil(),
                    userModel: models.getUserModel(),
                    featureFlagModel: models.getFeatureFlagModel(),
                    projectParametersModel: models.getProjectParametersModel(),
                    organizationWarehouseCredentialsModel:
                        models.getOrganizationWarehouseCredentialsModel(),
                    organizationModel: models.getOrganizationModel(),
                    projectCompileLogModel: models.getProjectCompileLogModel(),
                    adminNotificationService:
                        repository.getAdminNotificationService(),
                    spacePermissionService:
                        repository.getSpacePermissionService(),
                    contentVerificationModel:
                        models.getContentVerificationModel(),
                }),
            instanceConfigurationService: ({
                models,
                context,
                repository,
                utils,
            }) =>
                new InstanceConfigurationService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    organizationModel: models.getOrganizationModel(),
                    projectModel: models.getProjectModel(),
                    userModel: models.getUserModel(),
                    organizationAllowedEmailDomainsModel:
                        models.getOrganizationAllowedEmailDomainsModel(),
                    personalAccessTokenModel:
                        models.getPersonalAccessTokenModel(),
                    emailModel: models.getEmailModel(),
                    projectService: repository.getProjectService(),
                    serviceAccountModel: models.getServiceAccountModel(),
                    embedModel: models.getEmbedModel(),
                    encryptionUtil: utils.getEncryptionUtil(),
                }),
            asyncQueryService: ({
                models,
                context,
                clients,
                utils,
                repository,
                prometheusMetrics,
            }) =>
                new AsyncQueryService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    projectModel: models.getProjectModel(),
                    preAggregateModel: models.getPreAggregateModel(),
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
                    natsClient: clients.getNatsClient(),
                    downloadFileModel: models.getDownloadFileModel(),
                    fileStorageClient: clients.getFileStorageClient(),
                    groupsModel: models.getGroupsModel(),
                    tagsModel: models.getTagsModel(),
                    catalogModel: models.getCatalogModel(),
                    contentModel: models.getContentModel(),
                    encryptionUtil: utils.getEncryptionUtil(),
                    userModel: models.getUserModel(),
                    queryHistoryModel: models.getQueryHistoryModel(),
                    downloadAuditModel: models.getDownloadAuditModel(),
                    cacheService: repository.getCacheService(),
                    savedSqlModel: models.getSavedSqlModel(),
                    resultsStorageClient: clients.getResultsFileStorageClient(),
                    featureFlagModel: models.getFeatureFlagModel(),
                    projectParametersModel: models.getProjectParametersModel(),
                    organizationWarehouseCredentialsModel:
                        models.getOrganizationWarehouseCredentialsModel(),
                    organizationModel: models.getOrganizationModel(),
                    pivotTableService: repository.getPivotTableService(),
                    prometheusMetrics,
                    permissionsService: repository.getPermissionsService(),
                    persistentDownloadFileService:
                        repository.getPersistentDownloadFileService(),
                    preAggregateStrategy: new PreAggregateStrategy({
                        preAggregationDuckDbClient:
                            new PreAggregationDuckDbClient({
                                lightdashConfig: context.lightdashConfig,
                                preAggregateModel:
                                    models.getPreAggregateModel(),
                                projectModel: models.getProjectModel(),
                                prometheusMetrics,
                                sharedResourceLimits: context.lightdashConfig
                                    .preAggregates.duckdbQueryMemoryLimit
                                    ? {
                                          memoryLimit:
                                              context.lightdashConfig
                                                  .preAggregates
                                                  .duckdbQueryMemoryLimit,
                                      }
                                    : undefined,
                            }),
                        preAggregateDailyStatsModel:
                            models.getPreAggregateDailyStatsModel(),
                        preAggregateResultsStorageClient:
                            clients.getPreAggregateResultsFileStorageClient(),
                        isEnabled: () =>
                            context.lightdashConfig.preAggregates.enabled,
                        dashboardModel: models.getDashboardModel(),
                        savedChartModel: models.getSavedChartModel(),
                        projectService: repository.getProjectService(),
                    }),
                    projectCompileLogModel: models.getProjectCompileLogModel(),
                    adminNotificationService:
                        repository.getAdminNotificationService(),
                    spacePermissionService:
                        repository.getSpacePermissionService(),
                }),
            cacheService: ({ models, context, clients }) =>
                new CommercialCacheService({
                    queryHistoryModel: models.getQueryHistoryModel(),
                    lightdashConfig: context.lightdashConfig,
                    storageClient: clients.getResultsFileStorageClient(),
                }),
            mcpService: ({ context, repository, models }) =>
                new McpService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    asyncQueryService: repository.getAsyncQueryService(),
                    catalogService: repository.getCatalogService(),
                    contentVerificationService:
                        repository.getContentVerificationService(),
                    projectService: repository.getProjectService(),
                    savedSqlService: repository.getSavedSqlService(),
                    schedulerService: repository.getSchedulerService(),
                    shareService: repository.getShareService(),
                    userAttributesModel: models.getUserAttributesModel(),
                    searchModel: models.getSearchModel(),
                    spaceService: repository.getSpaceService(),
                    mcpContextModel: models.getMcpContextModel(),
                    projectModel: models.getProjectModel(),
                    featureFlagService: repository.getFeatureFlagService(),
                    aiOrganizationSettingsService:
                        repository.getAiOrganizationSettingsService(),
                    aiAgentService: repository.getAiAgentService(),
                }),
            slackService: ({ repository, clients }) =>
                new CommercialSlackService({
                    slackClient: clients.getSlackClient(),
                    unfurlService: repository.getUnfurlService(),
                    aiAgentService: repository.getAiAgentService(),
                }),
            managedAgentService: ({ context, models, clients }) =>
                new ManagedAgentService({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    managedAgentModel: models.getManagedAgentModel(),
                    analyticsModel: models.getAnalyticsModel(),
                    organizationModel: models.getOrganizationModel(),
                    projectModel: models.getProjectModel(),
                    validationModel: models.getValidationModel(),
                    savedChartModel: models.getSavedChartModel(),
                    dashboardModel: models.getDashboardModel(),
                    spaceModel: models.getSpaceModel(),
                    userModel: models.getUserModel(),
                    featureFlagModel: models.getFeatureFlagModel(),
                    serviceAccountModel: models.getServiceAccountModel(),
                    schedulerClient: clients.getSchedulerClient(),
                    slackClient: clients.getSlackClient(),
                    managedAgentClient: new ManagedAgentClient({
                        lightdashConfig: context.lightdashConfig,
                    }),
                }),
            deployService: ({ models, clients, repository, context }) =>
                new DeployService({
                    deploySessionModel: models.getDeploySessionModel(),
                    projectModel: models.getProjectModel(),
                    projectService: repository.getProjectService(),
                    schedulerClient: clients.getSchedulerClient(),
                    exploreEnhancer: (explores) =>
                        enhanceExploresForPreAggregates({
                            explores,
                            enabled:
                                context.lightdashConfig.preAggregates.enabled,
                        }),
                }),
        },
        modelProviders: {
            aiAgentModel: ({ database }) =>
                new AiAgentModel({ database, lightdashConfig }),
            aiOrganizationSettingsModel: ({ database }) =>
                new AiOrganizationSettingsModel({ database }),
            embedModel: ({ database }) => new EmbedModel({ database }),
            mcpContextModel: ({ database }) => new McpContextModel(database),
            dashboardSummaryModel: ({ database }) =>
                new DashboardSummaryModel({ database }),
            slackAuthenticationModel: ({ database }) =>
                new CommercialSlackAuthenticationModel({ database }),
            serviceAccountModel: ({ database }) =>
                new ServiceAccountModel({ database }),
            managedAgentModel: ({ database, utils }) =>
                new ManagedAgentModel({
                    database,
                    encryptionUtil: utils.getEncryptionUtil(),
                }),
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
                slackClient: context.clients.getSlackClient(),
                unfurlService: context.serviceRepository.getUnfurlService(),
                csvService: context.serviceRepository.getCsvService(),
                dashboardService:
                    context.serviceRepository.getDashboardService(),
                deployService: context.serviceRepository.getDeployService(),
                projectService: context.serviceRepository.getProjectService(),
                schedulerService:
                    context.serviceRepository.getSchedulerService(),
                validationService:
                    context.serviceRepository.getValidationService(),
                userService: context.serviceRepository.getUserService(),
                emailClient: context.clients.getEmailClient(),
                googleDriveClient: context.clients.getGoogleDriveClient(),
                fileStorageClient: context.clients.getFileStorageClient(),
                schedulerClient: context.clients.getSchedulerClient(),
                aiAgentService: context.serviceRepository.getAiAgentService(),
                catalogService: context.serviceRepository.getCatalogService(),
                encryptionUtil: context.utils.getEncryptionUtil(),
                msTeamsClient: context.clients.getMsTeamsClient(),
                googleChatClient: context.clients.getGoogleChatClient(),
                renameService: context.serviceRepository.getRenameService(),
                asyncQueryService:
                    context.serviceRepository.getAsyncQueryService(),
                embedService: context.serviceRepository.getEmbedService(),
                featureFlagService:
                    context.serviceRepository.getFeatureFlagService(),
                persistentDownloadFileService:
                    context.serviceRepository.getPersistentDownloadFileService(),
                preAggregateModel: context.models.getPreAggregateModel(),
                preAggregateMaterializationService:
                    context.serviceRepository.getPreAggregateMaterializationService(),
                managedAgentService:
                    context.serviceRepository.getManagedAgentService<ManagedAgentService>(),
                appGenerateService:
                    context.serviceRepository.getAppGenerateService(),
            }),
        clientProviders: {
            schedulerClient: ({ context, models }) =>
                new CommercialSchedulerClient({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    schedulerModel: models.getSchedulerModel(),
                }),
            slackClient: ({ context, models, repository }) =>
                new CommercialSlackClient({
                    analytics: context.lightdashAnalytics,
                    lightdashConfig: context.lightdashConfig,
                    slackAuthenticationModel:
                        models.getSlackAuthenticationModel() as CommercialSlackAuthenticationModel,
                    slackChannelCacheModel: models.getSlackChannelCacheModel(),
                    schedulerClient: repository.getSchedulerClient(),
                }),
        },
    };
}

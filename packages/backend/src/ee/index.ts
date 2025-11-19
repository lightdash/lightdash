import { ForbiddenError } from '@lightdash/common';
import express, { Express } from 'express';
import { AppArguments } from '../App';
import { lightdashConfig } from '../config/lightdashConfig';
import Logger from '../logging/logger';
import { McpContextModel } from '../models/McpContextModel';
import { AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import { InstanceConfigurationService } from '../services/InstanceConfigurationService/InstanceConfigurationService';
import { ProjectService } from '../services/ProjectService/ProjectService';
import { RolesService } from '../services/RolesService/RolesService';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import LicenseClient from './clients/License/LicenseClient';
import OpenAi from './clients/OpenAi';
import { CommercialSlackClient } from './clients/Slack/SlackClient';
import { AiAgentModel } from './models/AiAgentModel';
import { AiOrganizationSettingsModel } from './models/AiOrganizationSettingsModel';
import { CommercialFeatureFlagModel } from './models/CommercialFeatureFlagModel';
import { CommercialSlackAuthenticationModel } from './models/CommercialSlackAuthenticationModel';
import { DashboardSummaryModel } from './models/DashboardSummaryModel';
import { EmbedModel } from './models/EmbedModel';
import { ServiceAccountModel } from './models/ServiceAccountModel';
import { CommercialSchedulerClient } from './scheduler/SchedulerClient';
import { CommercialSchedulerWorker } from './scheduler/SchedulerWorker';
import { AiAgentAdminService } from './services/AiAgentAdminService';
import { AiAgentService } from './services/AiAgentService';
import { AiOrganizationSettingsService } from './services/AiOrganizationSettingsService';
import { AiService } from './services/AiService/AiService';
import { CommercialCacheService } from './services/CommercialCacheService';
import { CommercialSlackIntegrationService } from './services/CommercialSlackIntegrationService';
import { EmbedService } from './services/EmbedService/EmbedService';
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
            aiOrganizationSettingsService: ({ models }) =>
                new AiOrganizationSettingsService({
                    aiOrganizationSettingsModel:
                        models.getAiOrganizationSettingsModel(),
                    organizationModel: models.getOrganizationModel(),
                    commercialFeatureFlagModel:
                        models.getFeatureFlagModel() as CommercialFeatureFlagModel,
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
            organizationWarehouseCredentialsService: ({ models, context }) =>
                new OrganizationWarehouseCredentialsService({
                    analytics: context.lightdashAnalytics,
                    organizationWarehouseCredentialsModel:
                        models.getOrganizationWarehouseCredentialsModel(),
                    userModel: models.getUserModel(),
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
                    featureFlagModel: models.getFeatureFlagModel(),
                    projectParametersModel: models.getProjectParametersModel(),
                    organizationWarehouseCredentialsModel:
                        models.getOrganizationWarehouseCredentialsModel(),
                    projectCompileLogModel: models.getProjectCompileLogModel(),
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
                    downloadAuditModel: models.getDownloadAuditModel(),
                    cacheService: repository.getCacheService(),
                    savedSqlModel: models.getSavedSqlModel(),
                    resultsStorageClient: clients.getResultsFileStorageClient(),
                    featureFlagModel: models.getFeatureFlagModel(),
                    projectParametersModel: models.getProjectParametersModel(),
                    organizationWarehouseCredentialsModel:
                        models.getOrganizationWarehouseCredentialsModel(),
                    pivotTableService: repository.getPivotTableService(),
                    prometheusMetrics,
                    permissionsService: repository.getPermissionsService(),
                    projectCompileLogModel: models.getProjectCompileLogModel(),
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
                    catalogService: repository.getCatalogService(),
                    projectService: repository.getProjectService(),
                    userAttributesModel: models.getUserAttributesModel(),
                    searchModel: models.getSearchModel(),
                    spaceService: repository.getSpaceService(),
                    mcpContextModel: models.getMcpContextModel(),
                    projectModel: models.getProjectModel(),
                    featureFlagService: repository.getFeatureFlagService(),
                }),
            slackService: ({ repository, clients }) =>
                new CommercialSlackService({
                    slackClient: clients.getSlackClient(),
                    unfurlService: repository.getUnfurlService(),
                    aiAgentService: repository.getAiAgentService(),
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
                aiAgentService: context.serviceRepository.getAiAgentService(),
                catalogService: context.serviceRepository.getCatalogService(),
                encryptionUtil: context.utils.getEncryptionUtil(),
                msTeamsClient: context.clients.getMsTeamsClient(),
                renameService: context.serviceRepository.getRenameService(),
                asyncQueryService:
                    context.serviceRepository.getAsyncQueryService(),
                embedService: context.serviceRepository.getEmbedService(),
                featureFlagService:
                    context.serviceRepository.getFeatureFlagService(),
            }),
        clientProviders: {
            schedulerClient: ({ context, models }) =>
                new CommercialSchedulerClient({
                    lightdashConfig: context.lightdashConfig,
                    analytics: context.lightdashAnalytics,
                    schedulerModel: models.getSchedulerModel(),
                }),
            slackClient: ({ context, models }) =>
                new CommercialSlackClient({
                    analytics: context.lightdashAnalytics,
                    lightdashConfig: context.lightdashConfig,
                    slackAuthenticationModel:
                        models.getSlackAuthenticationModel() as CommercialSlackAuthenticationModel,
                }),
        },
    };
}

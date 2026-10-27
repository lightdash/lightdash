export type DirectReaders = Record<string, Record<string, number>>;

export const pendingDirectReaders: DirectReaders = {
    'ee/services/AiAgentAdminService.ts': {
        getWithSensitiveFields: 1,
    },
    'ee/services/AiAgentService/AiAgentService.ts': {
        getWarehouseCredentialsForBinding: 1,
    },
    'ee/services/AiAgentToolsService/AiAgentToolsService.ts': {
        getWarehouseCredentialsForBinding: 1,
    },
    'ee/services/AiWritebackService/providers/BitbucketProvider.ts': {
        getWithSensitiveFields: 1,
    },
    'ee/services/OnboardingAgentService/OnboardingAgentService.ts': {
        getWithSensitiveFields: 1,
    },
    'ee/services/OrganizationWarehouseCredentialsService.ts': {
        getByUuidWithSensitiveData: 1,
    },
    'ee/services/SchedulerAiAugmentationService/SchedulerAiAugmentationService.ts':
        {
            getWarehouseCredentialsForBinding: 1,
            getCredentials: 1,
        },
    'services/AiAccessService/AiAccessService.ts': {
        getWarehouseCredentialsForBinding: 3,
        getCredentials: 2,
        findAiCredentialWithSecrets: 1,
    },
    'services/AiServiceAccountService/AiServiceAccountService.ts': {
        getWarehouseCredentialsForBinding: 1,
        getCredentials: 1,
    },
    'services/DeployService.ts': {
        getWithSensitiveFields: 2,
    },
    'services/GitIntegrationService/GitIntegrationService.ts': {
        getWarehouseCredentialsForBinding: 1,
        getWithSensitiveFields: 3,
    },
    'services/InstanceConfigurationService/InstanceConfigurationService.ts': {
        getWithSensitiveFields: 2,
    },
    'services/OAuthRefresh/OAuthCredentialRefreshSource.ts': {
        getOwnWarehouseCredentialsForProject: 2,
        getOwnCredentials: 2,
        getByUuidWithSensitiveData: 3,
        getByUuidWithSecrets: 2,
        findAiCredentialWithSecrets: 2,
    },
    'services/ProjectService/ProjectService.ts': {
        getWarehouseCredentialsForProject: 2,
        getWarehouseCredentialsForProjectUncached: 1,
        getWarehouseCredentialsForBinding: 12,
        getWithSensitiveFields: 16,
        getCredentials: 1,
        getExtraCredentialSource: 1,
        getByUuidWithSensitiveData: 1,
        findForProjectWithSecrets: 3,
        getByUuidWithSecrets: 1,
    },
    'services/UserService.ts': {
        findDatabricksOauthU2mForHostWithSecrets: 3,
    },
    'services/WarehouseClientFactory/resolvers/DatabricksOAuthCredentialResolver.ts':
        {
            findDatabricksOauthU2mForHostWithSecrets: 2,
        },
    'services/WarehouseClientFactory/resolvers/SnowflakeAgentSignInCredentialResolver.ts':
        {
            getByUuidWithSecrets: 1,
            findAiCredentialWithSecrets: 3,
        },
    'services/WarehouseConnectionService/WarehouseConnectionService.ts': {
        getWarehouseCredentialsForProject: 5,
        getCredentials: 1,
        getExtraCredentialSource: 3,
        loadOrganizationCredentials: 1,
    },
    'services/WarehouseConnectionSwitchService/WarehouseConnectionSwitchService.ts':
        {
            getWarehouseCredentialsForProject: 2,
            loadOrganizationCredentials: 1,
        },
    'services/cliDeploy.ts': {
        getWarehouseCredentialsForBinding: 2,
        getCredentials: 2,
    },
    'utils/sharedSignInExpiry.ts': {
        getWarehouseCredentialsForProject: 1,
    },
};

export const modelMentions: DirectReaders = {
    'models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel.ts':
        {
            getSecrets: 3,
            getReplaceableSecrets: 1,
        },
    'models/OrganizationWarehouseCredentialsModel.ts': {
        getByUuidWithSensitiveData: 1,
        getByNameWithSensitiveData: 1,
    },
    'models/ProjectModel/ProjectModel.ts': {
        getWarehouseCredentialsForProject: 3,
        getWarehouseCredentialsForProjectUncached: 2,
        getOwnWarehouseCredentialsForProject: 1,
        getWarehouseCredentialsForBinding: 1,
        getWithSensitiveFields: 3,
    },
    'models/UserWarehouseCredentials/UserWarehouseCredentialsModel.ts': {
        findForProjectWithSecrets: 1,
        getByUuidWithSecrets: 1,
        findAiCredentialWithSecrets: 1,
        findDatabricksOauthU2mForHostWithSecrets: 1,
    },
    'models/WarehouseConnectionModel/WarehouseConnectionModel.ts': {
        getCredentials: 1,
        getExtraCredentialSource: 2,
        getOwnCredentials: 1,
        loadOrganizationCredentials: 2,
        getByUuidWithSensitiveData: 1,
    },
};

export const sameNameOtherMethods: DirectReaders = {
    'clients/Google/GoogleDriveClient.ts': {
        getCredentials: 9,
    },
};

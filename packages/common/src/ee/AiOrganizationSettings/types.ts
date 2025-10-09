export type AiOrganizationSettings = {
    organizationUuid: string;
    aiAgentsVisible: boolean;
    createdAt: Date;
    updatedAt: Date;
};

export type CreateAiOrganizationSettings = {
    organizationUuid: string;
    aiAgentsVisible: boolean;
};

export type UpdateAiOrganizationSettings = {
    aiAgentsVisible: boolean;
};

export type ApiAiOrganizationSettingsResponse = {
    status: 'ok';
    results: AiOrganizationSettings;
};

export type ApiUpdateAiOrganizationSettingsResponse = {
    status: 'ok';
    results: AiOrganizationSettings;
};

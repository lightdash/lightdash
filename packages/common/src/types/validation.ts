export type ValidationResponse = {
    validationId?: number;
    createdAt: Date;
    name: string;
    chartUuid?: string;
    dashboardUuid?: string;
    projectUuid: string;
    error: string;
    lastUpdatedBy: string;
    lastUpdatedAt: Date;
};

export type ApiValidateResponse = {
    status: 'ok';
    results: ValidationResponse[];
};

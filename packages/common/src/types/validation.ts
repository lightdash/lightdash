export type ValidationResponse = {
    createdAt: Date;
    name: string;
    chartUuid?: string;
    dashboardUuid?: string;
    projectUuid: string;
    summary: string;
    error: string;
    lastUpdatedBy: string;
};

export type ApiValidateResponse = {
    status: 'ok';
    results: ValidationResponse[];
};

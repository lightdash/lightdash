export type BigqueryDataset = {
    projectId: string;
    location: string | undefined;
    datasetId: string;
    sizeBytes?: number | null;
};

export type ApiBigqueryDatasets = {
    status: 'ok';
    results: BigqueryDataset[];
};

export type BigqueryProject = {
    projectId: string;
    friendlyName: string | null;
};

export type ApiBigqueryProjects = {
    status: 'ok';
    results: BigqueryProject[];
};

export type BigqueryProjectRecommendation = {
    projectId: string | null;
};

export type ApiBigqueryProjectRecommendation = {
    status: 'ok';
    results: BigqueryProjectRecommendation;
};

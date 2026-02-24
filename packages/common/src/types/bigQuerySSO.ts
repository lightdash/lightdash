export type BigqueryDataset = {
    projectId: string;
    location: string | undefined;
    datasetId: string;
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

export type BigqueryDataset = {
    projectId: string;
    location: string | undefined;
    datasetId: string;
};

export type ApiBigqueryDatasets = {
    status: 'ok';
    results: BigqueryDataset[];
};

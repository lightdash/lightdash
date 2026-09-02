export const chartTypeBuilderPath = (
    projectUuid: string,
    dataAppVizUuid: string | null = null,
) => `/projects/${projectUuid}/chart-types/${dataAppVizUuid ?? 'new'}`;

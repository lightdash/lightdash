export const chartTypeBuilderPath = (
    projectUuid: string,
    dataAppVizUuidOrSlug: string | null = null,
) => `/projects/${projectUuid}/chart-types/${dataAppVizUuidOrSlug ?? 'new'}`;

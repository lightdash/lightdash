export const chartTypeBuilderPath = (
    projectUuidOrSlug: string,
    dataAppVizUuidOrSlug: string | null = null,
) =>
    `/projects/${projectUuidOrSlug}/chart-types/${dataAppVizUuidOrSlug ?? 'new'}`;

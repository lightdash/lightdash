export const chartTypeBuilderPath = (
    projectUuidOrSlug: string,
    dataAppVizUuidOrSlug: string | null = null,
) =>
    `/projects/${projectUuidOrSlug}/chart-studio/${dataAppVizUuidOrSlug ?? 'new'}`;

export const getContentAsCodeWriteBackInstanceId = (
    siteUrl: string,
): string => {
    try {
        return new URL(siteUrl).host.replace(/[^a-zA-Z0-9.-]/g, '-');
    } catch {
        return 'unknown';
    }
};

export const getContentAsCodeWriteBackBranchName = (
    instanceId: string,
    slug: string,
): string => `lightdash/write-back/${instanceId}/${slug}`;

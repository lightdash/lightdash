// Same-origin authenticated asset route (thumbnails, screenshots) served
// straight from the chart registry — a plain `<img src>` is enough, no
// query hook needed.
export const registryAssetUrl = (path: string): string =>
    `/api/v1/ee/chart-registry/assets?path=${encodeURIComponent(path)}`;

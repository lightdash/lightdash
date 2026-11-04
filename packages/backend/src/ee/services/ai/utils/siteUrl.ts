// Content hrefs are app-relative for the web UI; the model needs absolute links it can share outside it (e.g. Slack).
export const toSiteUrl = (siteUrl: string, path: string): string =>
    `${siteUrl.replace(/\/+$/, '')}${path}`;

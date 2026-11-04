// Content hrefs are app-relative for the web UI; the model needs absolute links it can share outside it (e.g. Slack).
export const toAbsoluteHref = (siteUrl: string, href: string): string =>
    `${siteUrl.replace(/\/+$/, '')}${href}`;

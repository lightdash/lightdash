import { type Breadcrumb, type Event } from '@sentry/react';

export const redactMobileSetupUrl = (value: string): string =>
    value.replace(
        /([?&](?:c|verification_code|code_verifier|code_challenge)=)[^&#\s]*/gi,
        '$1[redacted]',
    );

export const redactMobileSetupBreadcrumb = (
    breadcrumb: Breadcrumb,
): Breadcrumb => {
    if (breadcrumb.message)
        breadcrumb.message = redactMobileSetupUrl(breadcrumb.message);
    if (breadcrumb.data) {
        for (const key of ['url', 'from', 'to']) {
            if (typeof breadcrumb.data[key] === 'string') {
                breadcrumb.data[key] = redactMobileSetupUrl(
                    breadcrumb.data[key],
                );
            }
        }
    }
    return breadcrumb;
};

export const redactMobileSetupEvent = <T extends Event>(event: T): T => {
    if (event.message) event.message = redactMobileSetupUrl(event.message);
    if (event.transaction)
        event.transaction = redactMobileSetupUrl(event.transaction);
    for (const exception of event.exception?.values ?? []) {
        if (exception.value)
            exception.value = redactMobileSetupUrl(exception.value);
    }
    if (event.request?.url)
        event.request.url = redactMobileSetupUrl(event.request.url);
    if (event.request?.headers) {
        for (const key of Object.keys(event.request.headers)) {
            if (key.toLowerCase() === 'referer') {
                event.request.headers[key] = redactMobileSetupUrl(
                    event.request.headers[key],
                );
            }
        }
    }
    event.breadcrumbs?.forEach(redactMobileSetupBreadcrumb);
    for (const span of event.spans ?? []) {
        if (span.description)
            span.description = redactMobileSetupUrl(span.description);
        for (const key of ['url', 'http.url', 'url.full']) {
            if (typeof span.data?.[key] === 'string') {
                span.data[key] = redactMobileSetupUrl(span.data[key]);
            }
        }
    }
    return event;
};

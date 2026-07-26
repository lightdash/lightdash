import { validate as validateUuid } from 'uuid';

/**
 * Appends a uuid query param to a URL, picking the right separator (`?` or `&`)
 * and only when the value is a valid uuid. Returns the URL unchanged otherwise,
 * so links never end with a dangling `?` when the uuid is missing.
 */
export function appendUuidParam(
    url: string,
    key: string,
    value?: string | null,
): string {
    if (value && validateUuid(value)) {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}${key}=${value}`;
    }
    return url;
}

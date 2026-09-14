import { validate as validateUuid } from 'uuid';

export function appendUuidQueryParam(
    url: string,
    key: string,
    value?: string | null,
): string {
    if (!value || !validateUuid(value)) {
        return url;
    }
    const parsed = new URL(url);
    parsed.searchParams.set(key, value);
    return parsed.toString();
}

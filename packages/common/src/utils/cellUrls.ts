import { type FieldUrl } from '../types/field';

export const AUTO_DETECTED_URL_LABEL = 'Open link';

// Whole-value http(s) URLs only, so prose that happens to contain a link stays plain text.
export const isUrlValue = (value: unknown): value is string => {
    if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value))
        return false;
    if (!/^https?:\/\//i.test(value)) return false;
    try {
        const url = new URL(value);
        return (
            (url.protocol === 'http:' || url.protocol === 'https:') &&
            url.hostname.length > 0
        );
    } catch {
        return false;
    }
};

/**
 * Links a cell offers: the field's configured `urls` win; otherwise a raw
 * value that is itself a URL becomes a single "Open link" action.
 */
export const getCellUrls = (
    fieldUrls: FieldUrl[] | undefined,
    rawValue: unknown,
): FieldUrl[] => {
    if (rawValue === undefined || rawValue === null) return [];
    if (fieldUrls && fieldUrls.length > 0) return fieldUrls;
    if (isUrlValue(rawValue)) {
        return [{ label: AUTO_DETECTED_URL_LABEL, url: '${value.raw}' }];
    }
    return [];
};

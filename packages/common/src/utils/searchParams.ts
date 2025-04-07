import { validate as validateUuid } from 'uuid';

export function setUuidParam(key: string, value?: string | null) {
    if (value && validateUuid(value)) {
        return `${key}=${value}`;
    }
    return '';
}

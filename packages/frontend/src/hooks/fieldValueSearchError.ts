import { isApiError, LightdashError } from '@lightdash/common';

export type FieldValueSearchErrorKind =
    | 'configuration'
    | 'forbidden'
    | 'warehouse'
    | 'unknown';

export type FieldValueSearchError = {
    kind: FieldValueSearchErrorKind;
    detail: string | null;
};

const ERROR_KIND_BY_NAME: Record<string, FieldValueSearchErrorKind> = {
    ForbiddenError: 'forbidden',
    AuthorizationError: 'forbidden',
    NotFoundError: 'configuration',
    ParameterError: 'configuration',
    CompileError: 'configuration',
    FieldReferenceError: 'configuration',
    NonCompiledModelError: 'configuration',
    MissingCatalogEntryError: 'configuration',
    WarehouseQueryError: 'warehouse',
    WarehouseConnectionError: 'warehouse',
    MissingWarehouseCredentialsError: 'warehouse',
};

const kindFromName = (name: string): FieldValueSearchErrorKind =>
    ERROR_KIND_BY_NAME[name] ?? 'unknown';

const detailFor = (
    kind: FieldValueSearchErrorKind,
    message: string | undefined,
): string | null => {
    if (kind === 'forbidden') return null;
    const trimmed = message?.trim();
    return trimmed ? trimmed : null;
};

// Maps whatever the field-values request rejected with onto a small set of
// causes the filter input can explain to the user.
export const classifyFieldValueSearchError = (
    error: unknown,
): FieldValueSearchError => {
    if (isApiError(error)) {
        const kind = kindFromName(error.error.name);
        return { kind, detail: detailFor(kind, error.error.message) };
    }
    if (error instanceof LightdashError) {
        const kind = kindFromName(error.name);
        return { kind, detail: detailFor(kind, error.message) };
    }
    if (error instanceof Error) {
        return { kind: 'unknown', detail: detailFor('unknown', error.message) };
    }
    return { kind: 'unknown', detail: null };
};

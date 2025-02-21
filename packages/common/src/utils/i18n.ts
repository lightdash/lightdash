import { ZodArray, ZodObject, ZodTypeAny } from 'zod';

export type LanguageObject = {
    [key: string]: string | LanguageObject;
};

export function extractI18nKeys(
    schema: ZodTypeAny,
    data: any,
    currentPath = '',
): any {
    if (schema instanceof ZodObject) {
        const result: any = {};
        Object.entries(schema.shape).forEach(([key, fieldSchema]) => {
            const fieldPath = currentPath ? `${currentPath}.${key}` : key;
            if (fieldSchema.description?.includes('@i18n')) {
                result[key] = fieldPath;
            } else {
                const nested = extractI18nKeys(
                    fieldSchema,
                    data ? data[key] : undefined,
                    fieldPath,
                );
                if (Object.keys(nested).length > 0) result[key] = nested;
            }
        });
        return result;
    } else if (schema instanceof ZodArray) {
        if (!Array.isArray(data)) return [];
        return data.map((item, idx) =>
            extractI18nKeys(
                schema._def.type,
                item,
                currentPath ? `${currentPath}.${idx}` : `${idx}`,
            ),
        );
    }
    return {};
}

export function extractI18nValues(
    schema: ZodTypeAny,
    data: any,
    currentPath = '',
): any {
    if (schema instanceof ZodObject) {
        const result: any = {};
        Object.entries(schema.shape).forEach(([key, fieldSchema]) => {
            const fieldPath = currentPath ? `${currentPath}.${key}` : key;
            if (fieldSchema.description?.includes('@i18n')) {
                result[key] = data && key in data ? data[key] : null;
            } else {
                const nested = extractI18nValues(
                    fieldSchema,
                    data ? data[key] : undefined,
                    fieldPath,
                );
                if (Object.keys(nested).length > 0) result[key] = nested;
            }
        });
        return result;
    } else if (schema instanceof ZodArray) {
        if (!Array.isArray(data)) return [];
        return data.map((item, idx) =>
            extractI18nValues(
                schema._def.type,
                item,
                currentPath ? `${currentPath}.${idx}` : `${idx}`,
            ),
        );
    }
    return {};
}

import { type ContentAsCodeResourceKind } from '@lightdash/common';
import { describe, it } from 'vitest';
import swagger from '../../generated/swagger.json';

type OpenApiSchema = {
    $ref?: string;
    properties?: Record<string, unknown>;
    allOf?: OpenApiSchema[];
    anyOf?: OpenApiSchema[];
    oneOf?: OpenApiSchema[];
};

export interface ContentAsCodeSchemaContract {
    resource: ContentAsCodeResourceKind;
    modelSchema: string;
    documentSchema: string;
    skippedModelFields: readonly string[];
    documentOnlyFields: readonly string[];
}

const schemas = swagger.components.schemas as Record<string, OpenApiSchema>;
const schemaReferencePrefix = '#/components/schemas/';

const getSchemaFields = (schemaName: string): string[] => {
    const visited = new Set<string>();

    const visit = (schema: OpenApiSchema): Set<string> => {
        if (schema.$ref) {
            const referencedName = schema.$ref.replace(
                schemaReferencePrefix,
                '',
            );
            if (visited.has(referencedName)) return new Set();
            visited.add(referencedName);
            const referencedSchema = schemas[referencedName];
            if (!referencedSchema) {
                throw new Error(`OpenAPI schema "${referencedName}" not found`);
            }
            return visit(referencedSchema);
        }

        const fields = new Set(Object.keys(schema.properties ?? {}));
        [
            ...(schema.allOf ?? []),
            ...(schema.anyOf ?? []),
            ...(schema.oneOf ?? []),
        ]
            .map(visit)
            .forEach((nestedFields) =>
                nestedFields.forEach((field) => fields.add(field)),
            );
        return fields;
    };

    const schema = schemas[schemaName];
    if (!schema) throw new Error(`OpenAPI schema "${schemaName}" not found`);
    return [...visit(schema)].sort();
};

const difference = (left: readonly string[], right: readonly string[]) =>
    left.filter((field) => !right.includes(field));

const formatFields = (fields: readonly string[]) =>
    fields.map((field) => `  - ${field}`).join('\n');

export const assertContentAsCodeSchemaContract = ({
    resource,
    modelSchema,
    documentSchema,
    skippedModelFields,
    documentOnlyFields,
}: ContentAsCodeSchemaContract): void => {
    const modelFields = getSchemaFields(modelSchema);
    const documentFields = getSchemaFields(documentSchema);
    const currentSkippedFields = difference(modelFields, documentFields);
    const currentDocumentOnlyFields = difference(documentFields, modelFields);

    const uncoveredFields = difference(
        currentSkippedFields,
        skippedModelFields,
    );
    if (uncoveredFields.length > 0) {
        throw new Error(
            `[content-as-code:${resource}] ${modelSchema} has new fields not covered by ${documentSchema}:\n${formatFields(
                uncoveredFields,
            )}\n\nAdd them to ${documentSchema} and its adapters, or intentionally add them to skippedModelFields in ${resource}.test.ts.`,
        );
    }

    const staleSkippedFields = difference(
        skippedModelFields,
        currentSkippedFields,
    );
    if (staleSkippedFields.length > 0) {
        throw new Error(
            `[content-as-code:${resource}] Remove fields that are no longer skipped from ${resource}.test.ts:\n${formatFields(
                staleSkippedFields,
            )}`,
        );
    }

    const uncoveredDocumentFields = difference(
        currentDocumentOnlyFields,
        documentOnlyFields,
    );
    if (uncoveredDocumentFields.length > 0) {
        throw new Error(
            `[content-as-code:${resource}] ${documentSchema} has new fields without a matching ${modelSchema} field:\n${formatFields(
                uncoveredDocumentFields,
            )}\n\nAdd the matching model field, or intentionally add them to documentOnlyFields in ${resource}.test.ts.`,
        );
    }

    const staleDocumentOnlyFields = difference(
        documentOnlyFields,
        currentDocumentOnlyFields,
    );
    if (staleDocumentOnlyFields.length > 0) {
        throw new Error(
            `[content-as-code:${resource}] Remove fields that are no longer document-only from ${resource}.test.ts:\n${formatFields(
                staleDocumentOnlyFields,
            )}`,
        );
    }
};

export const describeContentAsCodeSchemaContract = (
    contract: ContentAsCodeSchemaContract,
): void => {
    describe(`${contract.resource} content-as-code schema contract`, () => {
        it('classifies every model and document field', () => {
            assertContentAsCodeSchemaContract(contract);
        });
    });
};

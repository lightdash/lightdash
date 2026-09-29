import {
    type DataAppVizFieldMapping,
    type DataAppVizOptionValues,
} from '../../types/savedCharts';
import assertUnreachable from '../../utils/assertUnreachable';
import {
    dataAppVizGradientValueSchema,
    type DataAppVizConfigOption,
    type DataAppVizOptionValue,
    type DataAppVizSchema,
} from './types';

/** The query's selected field ids, split by kind for slot pool matching. */
export type DataAppVizSelectedFields = {
    dimensions: string[];
    /** Explore metrics plus aggregation custom metric ids. */
    metrics: string[];
    tableCalculations: string[];
};

const getOptionValidationError = (
    declaration: DataAppVizConfigOption,
    value: DataAppVizOptionValue,
): string | null => {
    const received = JSON.stringify(value);
    switch (declaration.type) {
        case 'gradient':
            return dataAppVizGradientValueSchema.safeParse(value).success
                ? null
                : `Option "${declaration.name}" (gradient) expects 2–5 hex colors (3, 6, or 8 digits) and finite numeric or "auto" min/max bounds, received ${received}.`;
        case 'boolean':
            return typeof value !== 'boolean'
                ? `Option "${declaration.name}" (boolean) expects true or false, received ${received}.`
                : null;
        case 'number':
            if (typeof value !== 'number') {
                return `Option "${declaration.name}" (number) expects a number, received ${received}.`;
            }
            if (declaration.min !== undefined && value < declaration.min) {
                return `Option "${declaration.name}" (number) must be >= ${declaration.min}, received ${received}.`;
            }
            if (declaration.max !== undefined && value > declaration.max) {
                return `Option "${declaration.name}" (number) must be <= ${declaration.max}, received ${received}.`;
            }
            return null;
        case 'select': {
            const choiceValues = declaration.choices.map(
                (choice) => choice.value,
            );
            return typeof value !== 'string' || !choiceValues.includes(value)
                ? `Option "${declaration.name}" (select) must be one of: ${choiceValues.join(
                      ', ',
                  )}. Received ${received}.`
                : null;
        }
        case 'text':
        case 'color':
            return typeof value !== 'string'
                ? `Option "${declaration.name}" (${declaration.type}) expects a string, received ${received}.`
                : null;
        default:
            return assertUnreachable(declaration, `Unknown config option type`);
    }
};

/**
 * Validate a custom chart type binding against its declared schema: slot
 * names exist, required slots are bound, mapped field ids are selected in the
 * query and come from the slot's field pool (dimension/series slots take
 * dimensions, metric slots take metrics ∪ table calculations), and option
 * values match the type's declarations. Returns one message per problem.
 */
export const getDataAppVizChartConfigErrors = (
    {
        fieldMapping,
        optionValues,
    }: {
        fieldMapping: DataAppVizFieldMapping;
        optionValues?: DataAppVizOptionValues;
    },
    vizSchema: DataAppVizSchema,
    selectedFields: DataAppVizSelectedFields,
): string[] => {
    const errors: string[] = [];
    const declaredSlots = vizSchema.fields.map((field) => field.name);

    const unknownSlots = Object.keys(fieldMapping).filter(
        (slot) => !declaredSlots.includes(slot),
    );
    if (unknownSlots.length > 0) {
        errors.push(
            `Unknown field slots in fieldMapping: ${unknownSlots.join(
                ', ',
            )}. This custom chart type declares these slots: ${declaredSlots.join(
                ', ',
            )}.`,
        );
    }

    const unboundRequiredSlots = vizSchema.fields
        .filter((field) => {
            const binding = fieldMapping[field.name];
            return (
                field.required &&
                (binding === undefined ||
                    binding === '' ||
                    (Array.isArray(binding) && binding.length === 0))
            );
        })
        .map((field) => field.name);
    if (unboundRequiredSlots.length > 0) {
        errors.push(
            `Required field slots not bound in fieldMapping: ${unboundRequiredSlots.join(
                ', ',
            )}.`,
        );
    }

    const selectedFieldIds = [
        ...selectedFields.dimensions,
        ...selectedFields.metrics,
        ...selectedFields.tableCalculations,
    ];
    const selected = new Set(selectedFieldIds);
    const bindings = Object.entries(fieldMapping).flatMap(([slot, value]) =>
        (Array.isArray(value) ? value : [value]).map((fieldId) => ({
            slot,
            fieldId,
        })),
    );
    const unknownFieldIds = bindings.filter(
        ({ fieldId }) => !selected.has(fieldId),
    );
    if (unknownFieldIds.length > 0) {
        errors.push(
            `fieldMapping references field ids that are not selected in queryConfig: ${unknownFieldIds
                .map(({ slot, fieldId }) => `${slot} → ${fieldId}`)
                .join(
                    ', ',
                )}. Fields selected in this query: ${selectedFieldIds.join(
                ', ',
            )}.`,
        );
    }

    const dimensionSet = new Set(selectedFields.dimensions);
    const metricSet = new Set(selectedFields.metrics);
    Object.entries(fieldMapping).forEach(([slot, value]) => {
        const slotDeclaration = vizSchema.fields.find(
            (field) => field.name === slot,
        );
        // Unknown slots are already reported above.
        if (!slotDeclaration) return;

        if (slotDeclaration.multiple) {
            if (!Array.isArray(value)) {
                errors.push(
                    `Slot "${slot}" accepts multiple fields and must be bound to an array.`,
                );
                return;
            }

            const duplicateFieldIds = value.filter(
                (fieldId, index) => value.indexOf(fieldId) !== index,
            );
            if (duplicateFieldIds.length > 0) {
                errors.push(
                    `Slot "${slot}" cannot contain duplicate field ids: ${[
                        ...new Set(duplicateFieldIds),
                    ].join(', ')}.`,
                );
            }
        } else if (Array.isArray(value)) {
            errors.push(
                `Slot "${slot}" accepts one field and must not be bound to an array.`,
            );
            return;
        }

        const fieldIds = Array.isArray(value) ? value : [value];
        fieldIds.forEach((fieldId) => {
            // Unselected field ids are already reported above.
            if (!selected.has(fieldId)) return;

            let boundKind: 'dimension' | 'metric' | 'table calculation';
            if (dimensionSet.has(fieldId)) {
                boundKind = 'dimension';
            } else if (metricSet.has(fieldId)) {
                boundKind = 'metric';
            } else {
                boundKind = 'table calculation';
            }
            switch (slotDeclaration.type) {
                case 'dimension':
                case 'series':
                    if (boundKind !== 'dimension') {
                        errors.push(
                            `Slot "${slot}" (${slotDeclaration.type}) only accepts dimensions, but "${fieldId}" is a ${boundKind}. Dimensions selected in this query: ${selectedFields.dimensions.join(
                                ', ',
                            )}.`,
                        );
                    }
                    break;
                case 'metric':
                    if (boundKind === 'dimension') {
                        errors.push(
                            `Slot "${slot}" (metric) only accepts metrics or table calculations, but "${fieldId}" is a dimension. Metrics and table calculations selected in this query: ${[
                                ...selectedFields.metrics,
                                ...selectedFields.tableCalculations,
                            ].join(', ')}.`,
                        );
                    }
                    break;
                case 'column':
                    // Accepts any result column.
                    break;
                default:
                    assertUnreachable(
                        slotDeclaration.type,
                        `Unknown slot type: ${slotDeclaration.type}`,
                    );
            }
        });
    });

    if (optionValues) {
        const declaredOptions = vizSchema.configOptions;
        const declaredOptionNames = declaredOptions.map(
            (option) => option.name,
        );
        Object.entries(optionValues).forEach(([name, value]) => {
            const declaration = declaredOptions.find(
                (option) => option.name === name,
            );
            if (!declaration) {
                errors.push(
                    declaredOptionNames.length > 0
                        ? `Unknown option "${name}". This custom chart type declares these options: ${declaredOptionNames.join(
                              ', ',
                          )}.`
                        : `Unknown option "${name}". This custom chart type declares no options.`,
                );
                return;
            }
            const optionError = getOptionValidationError(declaration, value);
            if (optionError) {
                errors.push(optionError);
            }
        });
    }

    return errors;
};

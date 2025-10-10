import { type FieldSetDefinition } from '../types/dbt';
import { CompileError } from '../types/errors';
import { type Table } from '../types/explore';

/**
 * Separates field references into inclusions and exclusions based on '-' prefix
 */
function separateInclusionsAndExclusions(fields: string[]): {
    inclusions: string[];
    exclusions: Set<string>;
} {
    const inclusions: string[] = [];
    const exclusions: Set<string> = new Set();

    for (const field of fields) {
        if (field.startsWith('-')) {
            exclusions.add(field.substring(1)); // Remove the '-' prefix
        } else {
            inclusions.push(field);
        }
    }

    return { inclusions, exclusions };
}

/**
 * Applies exclusions and removes duplicates while preserving order
 */
function applyExclusionsAndDeduplicate(
    expandedFields: string[],
    exclusions: Set<string>,
): string[] {
    const result: string[] = [];
    const seen = new Set<string>();

    for (const field of expandedFields) {
        if (!exclusions.has(field) && !seen.has(field)) {
            result.push(field);
            seen.add(field);
        }
    }

    return result;
}

/**
 * Expands a single set, handling nested set references (one level deep only)
 * and applying any exclusions defined within the set
 */
function expandSingleSet(
    setName: string,
    setDefinition: FieldSetDefinition,
    currentTable: Table,
): string[] {
    // Separate inclusions and exclusions within this set definition
    const { inclusions, exclusions } = separateInclusionsAndExclusions(
        setDefinition.fields,
    );

    const expandedFields: string[] = [];

    for (const setField of inclusions) {
        if (setField.endsWith('*')) {
            // Nested set reference - expand it directly (one level)
            const nestedSetName = setField.substring(0, setField.length - 1);

            // Check if nested set exists
            if (!currentTable.sets || !currentTable.sets[nestedSetName]) {
                const availableSets = currentTable.sets
                    ? Object.keys(currentTable.sets).join(', ')
                    : 'none';
                throw new CompileError(
                    `Nested set "${nestedSetName}" referenced by set "${setName}" not found in table "${currentTable.name}". Available sets: ${availableSets}`,
                );
            }

            const nestedSetDef = currentTable.sets[nestedSetName];

            // Check for circular reference (A references B, B references A)
            if (
                nestedSetDef.fields.some(
                    (f) =>
                        f.endsWith('*') &&
                        f.substring(0, f.length - 1) === setName,
                )
            ) {
                throw new CompileError(
                    `Circular reference detected: set "${setName}" references set "${nestedSetName}", which references "${setName}"`,
                );
            }

            // Nested sets cannot themselves contain set references
            // (this ensures max one level of nesting)
            if (
                nestedSetDef.fields.some(
                    (f) => f.endsWith('*') && !f.startsWith('-'),
                )
            ) {
                throw new CompileError(
                    `Set "${nestedSetName}" contains set references, but only one level of nesting is allowed. Set "${setName}" → "${nestedSetName}" → another set is not permitted.`,
                );
            }

            // Expand the nested set (which will also handle its own exclusions)
            const nestedExpanded = expandSingleSet(
                nestedSetName,
                nestedSetDef,
                currentTable,
            );
            expandedFields.push(...nestedExpanded);
        } else {
            // Regular field or cross-table reference
            expandedFields.push(setField);
        }
    }

    // Apply exclusions defined in this set to the expanded fields
    return applyExclusionsAndDeduplicate(expandedFields, exclusions);
}

/**
 * Expands all set references from the inclusions list
 */
function expandSetReferences(
    inclusions: string[],
    currentTable: Table,
): string[] {
    const expandedFields: string[] = [];

    for (const inclusion of inclusions) {
        if (inclusion.endsWith('*')) {
            // This is a set reference
            const setName = inclusion.substring(0, inclusion.length - 1);

            // Check if set exists
            if (!currentTable.sets || !currentTable.sets[setName]) {
                const availableSets = currentTable.sets
                    ? Object.keys(currentTable.sets).join(', ')
                    : 'none';
                throw new CompileError(
                    `Set "${setName}" not found in table "${currentTable.name}". Available sets: ${availableSets}`,
                );
            }

            const setDefinition = currentTable.sets[setName];

            // Expand the set
            const setFields = expandSingleSet(
                setName,
                setDefinition,
                currentTable,
            );
            expandedFields.push(...setFields);
        } else {
            // Regular field reference
            expandedFields.push(inclusion);
        }
    }

    return expandedFields;
}

/**
 * Expands field references that include set references (ending with *)
 * and applies exclusions (starting with -)
 *
 * Supports one level of set nesting: a set can reference another set,
 * but the referenced set cannot contain set references.
 *
 * @param fields - Array of field names, set references (ending with *), or exclusions (starting with -)
 * @param currentTable - The table containing the sets being expanded
 * @returns Expanded field list with exclusions applied and duplicates removed
 */
export function expandFieldsWithSets(
    fields: string[],
    currentTable: Table,
): string[] {
    const { inclusions, exclusions } = separateInclusionsAndExclusions(fields);
    const expandedFields = expandSetReferences(inclusions, currentTable);
    const result = applyExclusionsAndDeduplicate(expandedFields, exclusions);

    return result;
}

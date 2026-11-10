import { type FieldSetDefinition } from '../types/dbt';
import { CompileError } from '../types/errors';
import { type Table } from '../types/explore';

// Set expansion only needs the table name (for error messages) and its sets,
// so callers can expand before the full Table is constructed.
type SetExpansionTable = Pick<Table, 'name' | 'sets'>;

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
 * Expands a single set, handling nested set references (up to 3 levels deep)
 * and applying any exclusions defined within the set
 */
function expandSingleSet(
    setName: string,
    setDefinition: FieldSetDefinition,
    currentTable: SetExpansionTable,
    depth = 1,
): string[] {
    if (depth > 3) {
        throw new CompileError(
            `Set nesting limit reached. Only up to 3 levels of nesting are allowed.`,
        );
    }
    // Separate inclusions and exclusions within this set definition
    const { inclusions, exclusions } = separateInclusionsAndExclusions(
        setDefinition.fields,
    );

    const expandedFields: string[] = [];

    for (const setField of inclusions) {
        if (setField.endsWith('*')) {
            // Nested set reference - expand it directly
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

            // Expand the nested set (which will also handle its own exclusions)
            const nestedExpanded = expandSingleSet(
                nestedSetName,
                nestedSetDef,
                currentTable,
                depth + 1,
            );
            expandedFields.push(...nestedExpanded);
        } else {
            // Regular field or cross-table reference
            expandedFields.push(setField);
        }
    }

    // Apply exclusions defined in this set (expanding excluded sets) to the expanded fields
    const expandedExclusions = new Set(
        [...exclusions].flatMap((exclusion) =>
            exclusion.endsWith('*')
                ? // eslint-disable-next-line @typescript-eslint/no-use-before-define
                  expandSetReference(exclusion, currentTable, depth + 1)
                : [exclusion],
        ),
    );
    return applyExclusionsAndDeduplicate(expandedFields, expandedExclusions);
}

/**
 * Expands a set reference (ending with *) into the fields of that set
 */
function expandSetReference(
    setReference: string,
    currentTable: SetExpansionTable,
    depth = 1,
): string[] {
    const setName = setReference.substring(0, setReference.length - 1);

    // Check if set exists
    if (!currentTable.sets || !currentTable.sets[setName]) {
        const availableSets = currentTable.sets
            ? Object.keys(currentTable.sets).join(', ')
            : 'none';
        throw new CompileError(
            `Set "${setName}" not found in table "${currentTable.name}". Available sets: ${availableSets}`,
        );
    }

    return expandSingleSet(
        setName,
        currentTable.sets[setName],
        currentTable,
        depth,
    );
}

export type LenientSetExpansionResult = {
    fields: string[];
    setExpansionErrors: string[];
};

/**
 * Like expandFieldsWithSets, but a set reference that fails to expand
 * (missing set, circular reference, nesting limit) is dropped and reported
 * instead of aborting the whole expansion.
 */
export function expandFieldsWithSetsLenient(
    fields: string[],
    currentTable: SetExpansionTable,
): LenientSetExpansionResult {
    const { inclusions, exclusions } = separateInclusionsAndExclusions(fields);
    const setExpansionErrors: string[] = [];

    const expandLeniently = (field: string): string[] => {
        if (!field.endsWith('*')) {
            return [field];
        }
        try {
            return expandSetReference(field, currentTable);
        } catch (e) {
            setExpansionErrors.push(
                e instanceof Error
                    ? e.message
                    : `Failed to expand set reference "${field}".`,
            );
            return [];
        }
    };

    return {
        fields: applyExclusionsAndDeduplicate(
            inclusions.flatMap(expandLeniently),
            new Set([...exclusions].flatMap(expandLeniently)),
        ),
        setExpansionErrors,
    };
}

/**
 * Expands field references that include set references (ending with *)
 * and applies exclusions (starting with -)
 *
 * Supports up to 3 levels of set nesting.
 *
 * @param fields - Array of field names, set references (ending with *), or exclusions (starting with -)
 * @param currentTable - The table containing the sets being expanded
 * @returns Expanded field list with exclusions applied and duplicates removed
 */
export function expandFieldsWithSets(
    fields: string[],
    currentTable: SetExpansionTable,
): string[] {
    const { fields: expandedFields, setExpansionErrors } =
        expandFieldsWithSetsLenient(fields, currentTable);
    if (setExpansionErrors.length > 0) {
        throw new CompileError(setExpansionErrors[0]);
    }
    return expandedFields;
}

export type JoinFieldSelection = {
    mode: 'include' | 'exclude';
    fields: string[];
};

/**
 * Expands a join's `fields` list. A list made up only of exclusions
 * (e.g. ['-email', '-pii_fields*']) selects every field of the joined
 * table except the excluded ones.
 */
export function expandJoinFields(
    fields: string[],
    currentTable: SetExpansionTable,
): JoinFieldSelection {
    if (fields.length > 0 && fields.every((field) => field.startsWith('-'))) {
        return {
            mode: 'exclude',
            fields: expandFieldsWithSets(
                fields.map((field) => field.substring(1)),
                currentTable,
            ),
        };
    }
    return {
        mode: 'include',
        fields: expandFieldsWithSets(fields, currentTable),
    };
}

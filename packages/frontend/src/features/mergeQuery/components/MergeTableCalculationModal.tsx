import {
    getItemId,
    MERGE_TABLE_NAME,
    snakeCaseName,
    type MergeTableCalculation,
} from '@lightdash/common';
import { extractColumnRefs, parse } from '@lightdash/formula';
import { Stack, Text, TextInput } from '@mantine/core';
import { IconCalculator } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { type FieldSuggestionItem } from '../../../components/common/SuggestionList';
import {
    explorerActions,
    selectSorts,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../explorer/store';
import { FormulaEditor } from '../../tableCalculation/components/FormulaForm/FormulaEditor';
import { useMerge } from '../context/useMerge';
import { getMergeTableCalculationSuggestions } from '../utils/getMergeTableCalculationSuggestions';

const withFormulaPrefix = (formula: string) =>
    formula.startsWith('=') ? formula : `=${formula}`;

const nextCalculationName = (
    displayName: string,
    calculations: MergeTableCalculation[],
    current?: MergeTableCalculation,
) => {
    const base = snakeCaseName(displayName);
    const names = new Set(
        calculations
            .filter((calculation) => calculation.name !== current?.name)
            .map((calculation) => calculation.name),
    );
    for (let suffix = 0; suffix < 100; suffix += 1) {
        const candidate = suffix === 0 ? base : `${base}_${suffix}`;
        if (!names.has(candidate)) return candidate;
    }
    throw new Error(`Table calculation ID "${displayName}" already exists.`);
};

export const MergeTableCalculationModal: FC<{
    opened: boolean;
    onClose: () => void;
    tableCalculation?: MergeTableCalculation;
}> = ({ opened, onClose, tableCalculation }) => {
    const merge = useMerge();
    const dispatch = useExplorerDispatch();
    const sorts = useExplorerSelector(selectSorts);
    const [displayName, setDisplayName] = useState(
        tableCalculation?.displayName ?? '',
    );
    const [formula, setFormula] = useState(tableCalculation?.formula ?? '=');
    const [error, setError] = useState<string | null>(null);
    const [referenceOpened, setReferenceOpened] = useState(false);

    const fieldSuggestions = useMemo<FieldSuggestionItem[]>(() => {
        return getMergeTableCalculationSuggestions(merge.mergeResults);
    }, [merge.mergeResults]);

    const validateFormula = () => {
        const normalized = withFormulaPrefix(formula.trim());
        try {
            const references = extractColumnRefs(parse(normalized));
            const available = new Set(
                fieldSuggestions.map((suggestion) => suggestion.id),
            );
            const unknown = references.filter(
                (reference) => !available.has(reference),
            );
            const nextError =
                unknown.length > 0
                    ? `Unknown merged field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`
                    : null;
            setError(nextError);
            return nextError;
        } catch (nextError) {
            const message =
                nextError instanceof Error
                    ? nextError.message
                    : 'Invalid formula';
            setError(message);
            return message;
        }
    };

    const handleSave = () => {
        const nameError = displayName.trim() ? null : 'Name is required';
        if (nameError) {
            setError(nameError);
            return;
        }
        if (validateFormula()) return;

        const name =
            tableCalculation &&
            tableCalculation.displayName === displayName.trim()
                ? tableCalculation.name
                : nextCalculationName(
                      displayName.trim(),
                      merge.tableCalculations,
                      tableCalculation,
                  );
        const calculation: MergeTableCalculation = {
            name,
            displayName: displayName.trim(),
            // Required by the existing public contract. Formula wins at compile.
            sql: '',
            formula: withFormulaPrefix(formula.trim()),
        };
        if (tableCalculation) {
            merge.updateTableCalculation(tableCalculation.name, calculation);
            if (tableCalculation.name !== calculation.name) {
                const oldFieldId = getItemId({
                    table: MERGE_TABLE_NAME,
                    name: tableCalculation.name,
                });
                const newFieldId = getItemId({
                    table: MERGE_TABLE_NAME,
                    name: calculation.name,
                });
                dispatch(
                    explorerActions.setSortFields(
                        sorts.map((sort) =>
                            sort.fieldId === oldFieldId
                                ? { ...sort, fieldId: newFieldId }
                                : sort,
                        ),
                    ),
                );
            }
        } else {
            merge.addTableCalculation(calculation);
        }
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={`${tableCalculation ? 'Edit' : 'Create'} Table Calculation`}
            icon={IconCalculator}
            size="xl"
            onConfirm={handleSave}
            confirmLabel={tableCalculation ? 'Save changes' : 'Create formula'}
            modalRootProps={{ closeOnClickOutside: false }}
        >
            <Stack gap="sm">
                <Text size="sm" fw={600}>
                    Formula
                </Text>
                <FormulaEditor
                    explore={undefined}
                    metricQuery={
                        merge.mergeResults?.metricQuery ?? {
                            exploreName: 'merge',
                            dimensions: [],
                            metrics: [],
                            filters: {},
                            sorts: [],
                            limit: 500,
                            tableCalculations: [],
                        }
                    }
                    fieldSuggestionsOverride={fieldSuggestions}
                    initialContent={formula}
                    onTextChange={setFormula}
                    onBlur={validateFormula}
                    referenceOpened={referenceOpened}
                    onReferenceToggle={setReferenceOpened}
                />
                {error && (
                    <Text size="xs" c="red.7">
                        {error}
                    </Text>
                )}
                <TextInput
                    label="Name"
                    value={displayName}
                    onChange={(event) =>
                        setDisplayName(event.currentTarget.value)
                    }
                    error={!displayName.trim() ? 'Name is required' : null}
                    data-testid="merge-table-calculation-name"
                />
            </Stack>
        </MantineModal>
    );
};

export const DeleteMergeTableCalculationModal: FC<{
    tableCalculation: MergeTableCalculation;
    onClose: () => void;
}> = ({ tableCalculation, onClose }) => {
    const merge = useMerge();
    const dispatch = useExplorerDispatch();
    const sorts = useExplorerSelector(selectSorts);
    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Delete Table Calculation"
            variant="delete"
            resourceType="table calculation"
            onConfirm={() => {
                merge.removeTableCalculation(tableCalculation.name);
                const fieldId = getItemId({
                    table: MERGE_TABLE_NAME,
                    name: tableCalculation.name,
                });
                dispatch(
                    explorerActions.setSortFields(
                        sorts.filter((sort) => sort.fieldId !== fieldId),
                    ),
                );
                onClose();
            }}
        />
    );
};

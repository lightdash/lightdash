// organize-imports-ignore
import { type Ace } from 'ace-builds';
import 'react-ace'; // Note: we need this import before the langTools import
import langTools from 'ace-builds/src-noconflict/ext-language_tools';
import {
    convertAdditionalMetric,
    type Field,
    getDimensions,
    getFieldRef,
    getItemId,
    type Metric,
} from '@lightdash/common';
import {
    type Dispatch,
    type SetStateAction,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    selectActiveFields,
    selectAdditionalMetrics,
    selectCustomDimensions,
    selectTableCalculations,
    selectTableName,
    useExplorerSelector,
    selectPeriodOverPeriod,
} from '../features/explorer/store';
import { useExplore } from './useExplore';

const createCompleter: (fields: Ace.Completion[]) => Ace.Completer = (
    fields,
) => ({
    getCompletions: (editor, session, pos, prefix, callback) => {
        callback(null, fields);
    },
});

const mapFieldsToCompletions = (
    fields: Field[],
    meta: string,
): Ace.Completion[] =>
    fields.reduce<Ace.Completion[]>((acc, field) => {
        const technicalOption: Ace.Completion = {
            caption: `\${${getFieldRef(field)}}`,
            value: `\${${getFieldRef(field)}}`,
            meta,
            score: Number.MAX_VALUE,
        };
        const friendlyOption: Ace.Completion = {
            ...technicalOption,
            caption: `${field.tableLabel} ${field.label}`,
        };
        return [...acc, technicalOption, friendlyOption];
    }, []);

const mapTableCalculationsToCompletions = (
    tableCalculations: { name: string; displayName: string }[],
): Ace.Completion[] =>
    tableCalculations.reduce<Ace.Completion[]>((acc, tableCalc) => {
        const technicalOption: Ace.Completion = {
            caption: `\${${tableCalc.name}}`,
            value: `\${${tableCalc.name}}`,
            meta: 'Table calculation',
            score: Number.MAX_VALUE,
        };
        const friendlyOption: Ace.Completion = {
            ...technicalOption,
            caption: tableCalc.displayName,
        };
        return [...acc, technicalOption, friendlyOption];
    }, []);

const mapCustomDimensionsToCompletions = (
    customDimensions: { id: string; name: string }[],
): Ace.Completion[] =>
    customDimensions.reduce<Ace.Completion[]>((acc, customDim) => {
        const technicalOption: Ace.Completion = {
            caption: `\${${customDim.id}}`,
            value: `\${${customDim.id}}`,
            meta: 'Custom dimension',
            score: Number.MAX_VALUE,
        };
        const friendlyOption: Ace.Completion = {
            ...technicalOption,
            caption: customDim.name,
        };
        return [...acc, technicalOption, friendlyOption];
    }, []);

export const useTableCalculationAceEditorCompleter = (): {
    setAceEditor: Dispatch<SetStateAction<Ace.Editor | undefined>>;
} => {
    const activeFields = useExplorerSelector(selectActiveFields);
    const tableName = useExplorerSelector(selectTableName);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const periodOverPeriod = useExplorerSelector(selectPeriodOverPeriod);
    const { data: exploreData } = useExplore(tableName, {
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });
    const [aceEditor, setAceEditor] = useState<Ace.Editor>();

    const customMetrics = useMemo(() => {
        if (!exploreData || !additionalMetrics) return [];
        return additionalMetrics.reduce<Metric[]>((acc, additionalMetric) => {
            const table = exploreData.tables[additionalMetric.table];
            if (table) {
                const metric = convertAdditionalMetric({
                    additionalMetric,
                    table,
                });
                return [...acc, metric];
            }
            return acc;
        }, []);
    }, [exploreData, additionalMetrics]);

    const allCompletions = useMemo(() => {
        if (!exploreData) return [];

        const fields = Object.values(exploreData.tables).reduce<
            Ace.Completion[]
        >(
            (acc, table) => [
                ...acc,
                ...mapFieldsToCompletions(
                    [
                        ...Object.values(table.metrics),
                        ...customMetrics.filter(
                            (customMetric) => customMetric.table === table.name,
                        ),
                    ]
                        .filter((field) => activeFields.has(getItemId(field)))
                        .reduce<Metric[]>((acc2, metric) => {
                            acc2.push(metric);
                            if (periodOverPeriod) {
                                acc2.push({
                                    ...metric,
                                    name: `${metric.name}_previous`,
                                    label: `${metric.label} (previous)`,
                                });
                            }
                            return acc2;
                        }, []),
                    'Metric',
                ),
                ...mapFieldsToCompletions(
                    Object.values(table.dimensions).filter((field) =>
                        activeFields.has(getItemId(field)),
                    ),
                    'Dimension',
                ),
            ],
            [],
        );

        // Add custom dimensions to completions (filtered to active ones)
        const activeCustomDimensions = (customDimensions || []).filter(
            (customDim) => activeFields.has(customDim.id),
        );
        const customDimensionCompletions = mapCustomDimensionsToCompletions(
            activeCustomDimensions,
        );

        // Doesn't need to be filtered to active -- table calcs don't exist when not active
        const tableCalculationCompletions =
            mapTableCalculationsToCompletions(tableCalculations);

        return [
            ...fields,
            ...tableCalculationCompletions,
            ...customDimensionCompletions,
        ];
    }, [
        exploreData,
        customMetrics,
        activeFields,
        customDimensions,
        tableCalculations,
        periodOverPeriod,
    ]);

    useEffect(() => {
        if (aceEditor && allCompletions.length > 0) {
            langTools.setCompleters([createCompleter(allCompletions)]);
        }
        return () => {
            langTools.setCompleters([]);
        };
    }, [aceEditor, allCompletions]);

    return {
        setAceEditor,
    };
};

export const useCustomDimensionsAceEditorCompleter = (): {
    setAceEditor: Dispatch<SetStateAction<Ace.Editor | undefined>>;
} => {
    const tableName = useExplorerSelector(selectTableName);
    const { data: exploreData } = useExplore(tableName, {
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });
    const [aceEditor, setAceEditor] = useState<Ace.Editor>();

    useEffect(() => {
        if (aceEditor && exploreData) {
            const activeExplore = exploreData;
            const fields = mapFieldsToCompletions(
                getDimensions(activeExplore),
                'Dimension',
            );
            langTools.setCompleters([createCompleter(fields)]);
        }
        return () => {
            langTools.setCompleters([]);
        };
    }, [aceEditor, exploreData]);

    return {
        setAceEditor,
    };
};

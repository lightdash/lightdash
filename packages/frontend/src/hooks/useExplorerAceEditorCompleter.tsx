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
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { useExplorerContext } from '../providers/ExplorerProvider';
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

export const useTableCalculationAceEditorCompleter = (): {
    setAceEditor: Dispatch<SetStateAction<Ace.Editor | undefined>>;
} => {
    const activeFields = useExplorerContext(
        (context) => context.state.activeFields,
    );
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );
    const explore = useExplore(tableName);
    const [aceEditor, setAceEditor] = useState<Ace.Editor>();

    useEffect(() => {
        if (aceEditor && explore.data) {
            const activeExplore = explore.data;
            const customMetrics = (additionalMetrics || []).reduce<Metric[]>(
                (acc, additionalMetric) => {
                    const table = explore.data.tables[additionalMetric.table];
                    if (table) {
                        const metric = convertAdditionalMetric({
                            additionalMetric,
                            table,
                        });
                        return [...acc, metric];
                    }
                    return acc;
                },
                [],
            );
            const fields = Object.values(activeExplore.tables).reduce<
                Ace.Completion[]
            >(
                (acc, table) => [
                    ...acc,
                    ...mapFieldsToCompletions(
                        [
                            ...Object.values(table.metrics),
                            ...customMetrics.filter(
                                (customMetric) =>
                                    customMetric.table === table.name,
                            ),
                        ].filter((field) => activeFields.has(getItemId(field))),
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
            langTools.setCompleters([createCompleter(fields)]);
        }
        return () => {
            langTools.setCompleters([]);
        };
    }, [aceEditor, explore, activeFields, additionalMetrics]);

    return {
        setAceEditor,
    };
};

export const useCustomDimensionsAceEditorCompleter = (): {
    setAceEditor: Dispatch<SetStateAction<Ace.Editor | undefined>>;
} => {
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const explore = useExplore(tableName);
    const [aceEditor, setAceEditor] = useState<Ace.Editor>();

    useEffect(() => {
        if (aceEditor && explore.data) {
            const activeExplore = explore.data;
            const fields = mapFieldsToCompletions(
                getDimensions(activeExplore),
                'Dimension',
            );
            langTools.setCompleters([createCompleter(fields)]);
        }
        return () => {
            langTools.setCompleters([]);
        };
    }, [aceEditor, explore]);

    return {
        setAceEditor,
    };
};

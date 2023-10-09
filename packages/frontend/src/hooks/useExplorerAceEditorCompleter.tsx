// organize-imports-ignore
import { Ace } from 'ace-builds';
import 'react-ace'; // Note: we need this import before the langTools import
import langTools from 'ace-builds/src-noconflict/ext-language_tools';
import {
    convertAdditionalMetric,
    Field,
    fieldId,
    getFieldRef,
    Metric,
} from '@lightdash/common';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useExplorerContext } from '../providers/ExplorerProvider';
import { useExplore } from './useExplore';

const createCompleter: (fields: Ace.Completion[]) => Ace.Completer = (
    fields,
) => ({
    getCompletions: (editor, session, pos, prefix, callback) => {
        callback(null, fields);
    },
});

const mapActiveFieldsToCompletions = (
    fields: Field[],
    selectedFields: Set<string>,
    meta: string,
): Ace.Completion[] =>
    fields.reduce<Ace.Completion[]>((acc, field) => {
        if (Array.from(selectedFields).includes(fieldId(field))) {
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
        }
        return [...acc];
    }, []);

export const useExplorerAceEditorCompleter = (): {
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
                    ...mapActiveFieldsToCompletions(
                        [
                            ...Object.values(table.metrics),
                            ...customMetrics.filter(
                                (customMetric) =>
                                    customMetric.table === table.name,
                            ),
                        ],
                        activeFields,
                        'Metric',
                    ),
                    ...mapActiveFieldsToCompletions(
                        Object.values(table.dimensions),
                        activeFields,
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

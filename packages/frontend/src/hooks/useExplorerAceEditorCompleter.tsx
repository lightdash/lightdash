import { Field, friendlyName, getFieldRef } from 'common';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { Ace } from 'ace-builds';
import langTools from 'ace-builds/src-noconflict/ext-language_tools';
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
            caption: `${friendlyName(field.table)} ${friendlyName(field.name)}`,
        };
        return [...acc, technicalOption, friendlyOption];
    }, []);

export const useExplorerAceEditorCompleter = (): {
    setAceEditor: Dispatch<SetStateAction<Ace.Editor | undefined>>;
} => {
    const explore = useExplore();
    const [aceEditor, setAceEditor] = useState<Ace.Editor>();

    useEffect(() => {
        if (aceEditor && explore.data) {
            const activeExplore = explore.data;
            const fields = Object.values(activeExplore.tables).reduce<
                Ace.Completion[]
            >(
                (acc, table) => [
                    ...acc,
                    ...mapFieldsToCompletions(
                        Object.values(table.metrics),
                        'Metric',
                    ),
                    ...mapFieldsToCompletions(
                        Object.values(table.dimensions),
                        'Dimension',
                    ),
                ],
                [],
            );
            langTools.setCompleters([
                ...aceEditor.completers,
                createCompleter(fields),
            ]);
        }
    }, [aceEditor, explore]);

    return {
        setAceEditor,
    };
};

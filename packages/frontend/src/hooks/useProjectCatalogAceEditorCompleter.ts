import { type ProjectCatalog } from '@lightdash/common';
import { type Ace } from 'ace-builds';
import langTools from 'ace-builds/src-noconflict/ext-language_tools';
import {
    useEffect,
    useMemo,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';

const createCompleter: (fields: Ace.Completion[]) => Ace.Completer = (
    fields,
) => ({
    getCompletions: (editor, session, pos, prefix, callback) => {
        callback(null, fields);
    },
});

export const useProjectCatalogAceEditorCompleter = (
    projectCatalog: ProjectCatalog | undefined,
): {
    setAceEditor: Dispatch<SetStateAction<Ace.Editor | undefined>>;
} => {
    const [aceEditor, setAceEditor] = useState<Ace.Editor>();

    const sqlTables = useMemo<string[]>(() => {
        if (projectCatalog) {
            const values: string[] = [];
            Object.values(projectCatalog).forEach((schemas) =>
                Object.values(schemas).forEach((tables) =>
                    Object.values(tables).forEach(({ sqlTable }) =>
                        values.push(sqlTable),
                    ),
                ),
            );
            return values;
        }
        return [];
    }, [projectCatalog]);

    useEffect(() => {
        if (aceEditor) {
            const fields = sqlTables.map<Ace.Completion>((sqlTable) => {
                const technicalOption: Ace.Completion = {
                    caption: sqlTable,
                    value: sqlTable,
                    meta: 'Table',
                    score: Number.MAX_VALUE,
                };
                return technicalOption;
            });
            langTools.setCompleters([createCompleter(fields)]);
        }
        return () => {
            langTools.setCompleters([]);
        };
    }, [aceEditor, sqlTables]);

    return {
        setAceEditor,
    };
};

import { stateExtensions } from 'codemirror-json-schema';
import { useMemo, type FC } from 'react';
import {
    BaseCodeMirrorEditor,
    type BaseCodeMirrorEditorProps,
} from './BaseCodeMirrorEditor';

export interface JsonEditorProps
    extends Omit<BaseCodeMirrorEditorProps, 'language'> {
    schema?: object;
}

export const JsonEditor: FC<JsonEditorProps> = ({
    schema,
    autocompletions,
    ...props
}) => {
    // Create schema extension if schema is provided
    const schemaExtensions = useMemo(() => {
        if (!schema) return undefined;

        return stateExtensions(schema);
    }, [schema]);

    return (
        <BaseCodeMirrorEditor
            language="json"
            autocompletions={autocompletions}
            additionalExtensions={schemaExtensions}
            {...props}
        />
    );
};

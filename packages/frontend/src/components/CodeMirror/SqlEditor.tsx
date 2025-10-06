import type { Diagnostic } from '@codemirror/lint';
import type { FC } from 'react';
import {
    BaseCodeMirrorEditor,
    type BaseCodeMirrorEditorProps,
} from './BaseCodeMirrorEditor';

export interface SqlEditorProps
    extends Omit<BaseCodeMirrorEditorProps, 'language'> {
    dialect?: 'postgres' | 'mysql' | 'bigquery' | 'snowflake' | 'sql';
    highlightErrors?: Array<{ from: number; to: number; message: string }>;
    onSubmit?: () => void;
}

export const SqlEditor: FC<SqlEditorProps> = ({
    dialect: _dialect,
    highlightErrors,
    onSubmit,
    autocompletions,
    ...props
}) => {
    // Convert highlight errors to diagnostics
    const diagnostics: Diagnostic[] | undefined = highlightErrors?.map(
        (error) => ({
            from: error.from,
            to: error.to,
            severity: 'error',
            message: error.message,
        }),
    );

    return (
        <BaseCodeMirrorEditor
            language="sql"
            autocompletions={autocompletions}
            diagnostics={diagnostics}
            onSubmit={onSubmit}
            {...props}
        />
    );
};

import type { FC } from 'react';
import {
    BaseCodeMirrorEditor,
    type BaseCodeMirrorEditorProps,
} from './BaseCodeMirrorEditor';

export interface JsonEditorProps
    extends Omit<BaseCodeMirrorEditorProps, 'language'> {
    // Schema validation can be added here in the future
    schema?: object;
}

export const JsonEditor: FC<JsonEditorProps> = ({ schema, ...props }) => {
    // TODO: Implement schema validation using diagnostics
    // For now, just provide JSON syntax highlighting

    return <BaseCodeMirrorEditor language="json" {...props} />;
};

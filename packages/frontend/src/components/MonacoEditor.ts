import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

loader.config({ monaco });

// eslint-disable-next-line react-refresh/only-export-components
export { Editor, useMonaco } from '@monaco-editor/react';
export type {
    BeforeMount,
    EditorProps,
    Monaco,
    OnChange,
    OnMount,
} from '@monaco-editor/react';
export default Editor;

import CodeMirror, {
    type ReactCodeMirrorProps,
    type ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
import { type FC, useRef } from 'react';
import { createExtensions, type ExtensionsConfig } from './extensions';

export interface BaseCodeMirrorEditorProps
    extends Omit<ReactCodeMirrorProps, 'extensions' | 'onSubmit'>,
        Omit<ExtensionsConfig, 'readOnly' | 'wrapEnabled' | 'showLineNumbers'> {
    onSubmit?: () => void;
    readOnly?: boolean;
    wrapEnabled?: boolean;
    showLineNumbers?: boolean;
}

export const BaseCodeMirrorEditor: FC<BaseCodeMirrorEditorProps> = ({
    value,
    onChange,
    onBlur,
    height,
    minHeight = '100px',
    maxHeight,
    placeholder,
    language,
    autocompletions,
    diagnostics,
    additionalExtensions,
    readOnly = false,
    wrapEnabled = false,
    showLineNumbers = true,
    onSubmit,
    ...rest
}) => {
    const editorRef = useRef<ReactCodeMirrorRef>(null);

    const extensions = createExtensions({
        language,
        autocompletions,
        diagnostics,
        additionalExtensions,
        readOnly,
        wrapEnabled,
        showLineNumbers,
        onSubmit,
    });

    const handleContainerClick = (e: React.MouseEvent) => {
        // Only focus if clicking on the container itself, not on the editor content
        if (e.target === e.currentTarget) {
            editorRef.current?.view?.focus();
        }
    };

    return (
        <div
            onClick={handleContainerClick}
            style={{
                height: height || 'auto',
                minHeight,
                maxHeight,
                cursor: 'text',
            }}
        >
            <CodeMirror
                ref={editorRef}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                extensions={extensions}
                height={height}
                minHeight={minHeight}
                maxHeight={maxHeight}
                placeholder={placeholder}
                basicSetup={{
                    lineNumbers: showLineNumbers,
                    highlightActiveLineGutter: showLineNumbers,
                    highlightSpecialChars: true,
                    history: true,
                    foldGutter: true,
                    drawSelection: true,
                    dropCursor: true,
                    allowMultipleSelections: true,
                    indentOnInput: true,
                    syntaxHighlighting: true,
                    bracketMatching: true,
                    closeBrackets: true,
                    autocompletion: true,
                    rectangularSelection: true,
                    crosshairCursor: true,
                    highlightActiveLine: true,
                    highlightSelectionMatches: true,
                    closeBracketsKeymap: true,
                    defaultKeymap: true,
                    searchKeymap: true,
                    historyKeymap: true,
                    foldKeymap: true,
                    completionKeymap: true,
                    lintKeymap: true,
                }}
                {...rest}
            />
        </div>
    );
};

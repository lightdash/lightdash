import React, { FC } from 'react';
import AceEditor, { IAceEditorProps } from 'react-ace';
import InputWrapper, { InputWrapperProps } from './InputWrapper';
import { useExplorerAceEditorCompleter } from '../../hooks/useExplorerAceEditorCompleter';

interface TextareaProps extends Omit<InputWrapperProps, 'render'> {
    attributes: IAceEditorProps;
}

const Textarea: FC<TextareaProps> = ({ attributes, ...rest }) => {
    const { setAceEditor } = useExplorerAceEditorCompleter();
    return (
        <InputWrapper
            {...rest}
            render={(props, { field }) => (
                <AceEditor
                    onLoad={setAceEditor}
                    {...attributes}
                    {...props}
                    {...field}
                />
            )}
        />
    );
};

export default Textarea;

import MDEditor, { MDEditorProps } from '@uiw/react-md-editor';
import { FC } from 'react';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

interface TextareaProps extends Omit<InputWrapperProps, 'render'> {
    attributes?: MDEditorProps;
}

const MarkdownInput: FC<TextareaProps> = ({ attributes, ...rest }) => (
    <InputWrapper
        {...rest}
        render={(props, { field }) => (
            <MDEditor {...attributes} {...props} {...field} />
        )}
    />
);

export default MarkdownInput;

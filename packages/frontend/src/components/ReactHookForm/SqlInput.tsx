import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/theme-github';
import { FC } from 'react';
import AceEditor, { IAceEditorProps } from 'react-ace';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

interface TextareaProps extends Omit<InputWrapperProps, 'render'> {
    attributes: IAceEditorProps;
}

const SqlInput: FC<TextareaProps> = ({ attributes, ...rest }) => (
    <InputWrapper
        {...rest}
        render={(props, { field }) => (
            <AceEditor
                mode="sql"
                theme="github"
                {...attributes}
                {...props}
                {...field}
            />
        )}
    />
);

export default SqlInput;

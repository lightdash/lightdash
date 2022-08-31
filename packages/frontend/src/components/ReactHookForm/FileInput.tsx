import { Card, Elevation, FileInput as File } from '@blueprintjs/core';
import React, { ComponentProps, FC, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

interface FileFieldProps extends Omit<InputWrapperProps, 'render'> {
    acceptedTypes?: React.HTMLProps<HTMLInputElement>['accept'];
    fileInputProps?: ComponentProps<typeof File>;
}

const FileInput: FC<FileFieldProps> = ({
    acceptedTypes,
    fileInputProps,
    ...rest
}) => {
    const [fileName, setFileName] = useState<string>();
    const { setError } = useFormContext();
    return (
        <>
            <InputWrapper
                {...rest}
                render={(props, { field: { onChange, onBlur, name } }) => (
                    <File
                        fill
                        hasSelection={!!fileName}
                        text={fileName}
                        inputProps={{
                            accept: acceptedTypes,
                        }}
                        onInputChange={(e) => {
                            const file = (e.target as HTMLInputElement)
                                .files?.[0];
                            if (file) {
                                const fileReader = new FileReader();
                                fileReader.onload = (event) => {
                                    const contents = event.target?.result;
                                    if (typeof contents === 'string') {
                                        setFileName(file.name);
                                        onChange(JSON.parse(contents));
                                    } else {
                                        setError(name, {
                                            message: 'Unexpected file content',
                                            type: 'unexpected_file_content',
                                        });
                                    }
                                };
                                fileReader.readAsText(file);
                            }
                        }}
                        onBlur={onBlur}
                        {...props}
                        {...fileInputProps}
                    />
                )}
            />
            {fileName && (
                <Card
                    style={{
                        backgroundColor: '#B1ECB5', // light green
                        textAlign: 'center',
                        padding: 10,
                    }}
                    elevation={Elevation.ONE}
                >
                    <span>
                        Your file{' '}
                        <span style={{ fontWeight: 'bold' }}>{fileName}</span>{' '}
                        was uploaded successfully!
                    </span>
                </Card>
            )}
        </>
    );
};

export default FileInput;

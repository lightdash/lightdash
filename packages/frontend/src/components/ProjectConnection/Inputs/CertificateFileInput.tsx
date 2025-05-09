import { CloseButton, FileInput } from '@mantine/core';
import React, { type FC, useState } from 'react';
import { useFormContext } from '../formContext';

const CertificateFileInput: FC<
    {
        label: string;
        disabled: boolean;
        description: React.ReactNode;
        accept: string;
    } & (
        | {
              name: 'warehouse.sslcert';
              fileNameProperty: 'warehouse.sslcertFileName';
          }
        | {
              name: 'warehouse.sslkey';
              fileNameProperty: 'warehouse.sslkeyFileName';
          }
        | {
              name: 'warehouse.sslrootcert';
              fileNameProperty: 'warehouse.sslrootcertFileName';
          }
    )
> = ({ name, fileNameProperty, label, disabled, description, accept }) => {
    const form = useFormContext();

    const fileNamefield = form.getInputProps(fileNameProperty);
    const fileField = form.getInputProps(name);

    const fileNamePlaceholder = fileField.value;

    const [temporaryFile, setTemporaryFile] = useState<File | null>(null);
    return (
        <>
            {/* Registering a hidden field for file name */}
            <input type="hidden" {...fileNamefield} />

            <FileInput
                label={label}
                // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                // @ts-ignore
                placeholder={fileNamePlaceholder || 'Choose file...'}
                description={description}
                {...fileField}
                accept={accept}
                value={temporaryFile}
                onChange={(file) => {
                    if (file) {
                        const fileReader = new FileReader();
                        fileReader.onload = function (event) {
                            const contents = event.target?.result;
                            if (typeof contents === 'string') {
                                setTemporaryFile(file);
                                form.setFieldValue(name, contents);
                                form.setFieldValue(fileNameProperty, file.name);
                            } else {
                                form.setFieldValue(name, null);
                                form.setFieldValue(fileNameProperty, undefined);
                            }
                        };
                        fileReader.readAsText(file);
                    }
                    fileNamefield.onChange(null);
                }}
                disabled={disabled}
                rightSection={
                    (temporaryFile || fileNamePlaceholder) && (
                        <CloseButton
                            variant="transparent"
                            onClick={() => {
                                setTemporaryFile(null);
                                form.setFieldValue(name, null);
                                form.setFieldValue(fileNameProperty, '');
                            }}
                        />
                    )
                }
            />
        </>
    );
};

export default CertificateFileInput;

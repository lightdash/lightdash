import { FileInput } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';

type KeyFileContents = Record<string, string>;

export const BigQueryKeyFileInput = ({
    value,
    onChange,
    onKeyfileChange,
    disabled,
}: {
    value: File | null;
    onChange: (file: File | null) => void;
    onKeyfileChange: (contents: KeyFileContents | null) => void;
    disabled?: boolean;
}) => {
    const [error, setError] = useState<string | null>(null);
    const readerRef = useRef<FileReader | null>(null);
    useEffect(() => () => readerRef.current?.abort(), []);

    const readFile = (file: File | null) => {
        readerRef.current?.abort();
        onChange(file);
        onKeyfileChange(null);
        setError(null);
        if (!file) return;
        const reader = new FileReader();
        readerRef.current = reader;
        reader.onload = () => {
            if (readerRef.current !== reader) return;
            try {
                const contents: unknown = JSON.parse(String(reader.result));
                if (
                    typeof contents !== 'object' ||
                    contents === null ||
                    !('type' in contents) ||
                    contents.type !== 'service_account'
                ) {
                    setError('Use a service account key file.');
                    return;
                }
                if (
                    !Object.values(contents).every(
                        (item) => typeof item === 'string',
                    )
                ) {
                    setError('Use a valid service account key file.');
                    return;
                }
                onKeyfileChange(contents as KeyFileContents);
            } catch {
                setError('Use a valid JSON key file.');
            }
        };
        reader.onerror = () => setError('Could not read the key file.');
        reader.readAsText(file);
    };

    return (
        <FileInput
            label="Service account key file"
            placeholder="Select a JSON key file"
            accept="application/json,.json"
            value={value}
            onChange={readFile}
            error={error}
            disabled={disabled}
            clearable
        />
    );
};

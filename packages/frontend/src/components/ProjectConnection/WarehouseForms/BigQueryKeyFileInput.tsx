import { FileInput } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation('projectConnection');
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
                    setError(t('bigQueryKeyFile.notServiceAccount'));
                    return;
                }
                if (
                    !Object.values(contents).every(
                        (item) => typeof item === 'string',
                    )
                ) {
                    setError(t('bigQueryKeyFile.invalidServiceAccount'));
                    return;
                }
                onKeyfileChange(contents as KeyFileContents);
            } catch {
                setError(t('bigQueryKeyFile.invalidJson'));
            }
        };
        reader.onerror = () => setError(t('bigQueryKeyFile.readFailed'));
        reader.readAsText(file);
    };

    return (
        <FileInput
            label={t('bigQueryKeyFile.label')}
            placeholder={t('bigQueryKeyFile.placeholder')}
            accept="application/json,.json"
            value={value}
            onChange={readFile}
            error={error}
            disabled={disabled}
            clearable
        />
    );
};

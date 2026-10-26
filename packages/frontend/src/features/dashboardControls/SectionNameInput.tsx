import { TextInput } from '@mantine/core';
import { useRef, type FC } from 'react';

type NameInputProps = {
    name: string;
    onCommit: (name: string) => void;
    onCancel: () => void;
    inputClassName: string;
};

// Enter or blur with a name commits; Escape or an empty name cancels
export const SectionNameInput: FC<NameInputProps> = ({
    name,
    onCommit,
    onCancel,
    inputClassName,
}) => {
    const isDone = useRef(false);
    const finish = (value: string) => {
        if (isDone.current) return;
        isDone.current = true;
        const trimmed = value.trim();
        if (trimmed === '') onCancel();
        else onCommit(trimmed);
    };
    return (
        <TextInput
            aria-label="Section name"
            placeholder="Section name"
            size="xs"
            classNames={{ input: inputClassName }}
            defaultValue={name}
            autoFocus
            data-own-escape
            onBlur={(event) => finish(event.currentTarget.value)}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    finish(event.currentTarget.value);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    finish('');
                }
            }}
        />
    );
};

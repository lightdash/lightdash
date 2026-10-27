import { Box, TextInput } from '@mantine/core';
import { useRef, useState, type FC } from 'react';
import classes from './SectionedFilters.module.css';

type NameInputProps = {
    name: string;
    onCommit: (name: string) => void;
    onCancel: () => void;
};

const PLACEHOLDER = 'Section name';

// Enter or blur with a name commits; Escape or an empty name cancels. The
// input is as wide as its text (`data-size-to`), so the bar does not move
export const SectionNameInput: FC<NameInputProps> = ({
    name,
    onCommit,
    onCancel,
}) => {
    const isDone = useRef(false);
    const [value, setValue] = useState(name);
    const finish = (text: string) => {
        if (isDone.current) return;
        isDone.current = true;
        const trimmed = text.trim();
        if (trimmed === '') onCancel();
        else onCommit(trimmed);
    };
    return (
        <Box className={classes.nameSizer} data-size-to={value || PLACEHOLDER}>
            <TextInput
                aria-label={PLACEHOLDER}
                placeholder={PLACEHOLDER}
                size="xs"
                classNames={{ input: classes.nameInputField }}
                value={value}
                onChange={(event) => setValue(event.currentTarget.value)}
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
        </Box>
    );
};

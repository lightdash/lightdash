import { ActionIcon, Box, Group, TextInput } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useRef, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './SectionedFilters.module.css';

type NameInputProps = {
    name: string;
    onCommit: (name: string) => void;
    onCancel: () => void;
};

const PLACEHOLDER = 'Section name';

// Enter, blur or the check with a name commits; Escape, the X or an empty
// name cancels. The input is as wide as its text (`data-size-to`), so the
// bar does not move
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
                rightSectionWidth={44}
                rightSectionPointerEvents="all"
                rightSection={
                    // A press keeps focus in the input, so no blur commits first
                    <Group
                        gap={2}
                        wrap="nowrap"
                        onMouseDown={(event) => event.preventDefault()}
                    >
                        <ActionIcon
                            size="xs"
                            radius="xl"
                            aria-label="Keep name"
                            disabled={value.trim() === ''}
                            onClick={() => finish(value)}
                        >
                            <MantineIcon icon={IconCheck} size={14} />
                        </ActionIcon>
                        <ActionIcon
                            size="xs"
                            radius="xl"
                            aria-label="Discard"
                            onClick={() => finish('')}
                        >
                            <MantineIcon icon={IconX} size={14} />
                        </ActionIcon>
                    </Group>
                }
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

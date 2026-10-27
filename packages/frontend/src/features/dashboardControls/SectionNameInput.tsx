import { ActionIcon, Box, Group, TextInput } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useRef, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './SectionedFilters.module.css';

/** How naming ended: a key, a pointer, or a blur that took focus to
 * another element (which keeps it). */
export type NameExit = 'keyboard' | 'pointer' | 'elsewhere';

type NameInputProps = {
    name: string;
    onCommit: (name: string, exit: NameExit) => void;
    onCancel: (exit: NameExit) => void;
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
    const finish = (text: string, exit: NameExit) => {
        if (isDone.current) return;
        isDone.current = true;
        const trimmed = text.trim();
        if (trimmed === '') onCancel(exit);
        else onCommit(trimmed, exit);
    };
    return (
        <Box className={classes.nameSizer} data-size-to={value || PLACEHOLDER}>
            <TextInput
                aria-label={PLACEHOLDER}
                placeholder={PLACEHOLDER}
                size="xs"
                classNames={{ input: classes.nameInputField }}
                rightSectionWidth={48}
                rightSectionPointerEvents="all"
                rightSection={
                    // A press keeps focus in the input, so no blur commits
                    // first; out of the tab order, as Enter and Escape do the same
                    <Group
                        gap={4}
                        wrap="nowrap"
                        onMouseDown={(event) => event.preventDefault()}
                    >
                        <ActionIcon
                            size="xs"
                            radius="xl"
                            aria-label="Keep name"
                            tabIndex={-1}
                            disabled={value.trim() === ''}
                            onClick={(event) =>
                                finish(
                                    value,
                                    event.detail > 0 ? 'pointer' : 'keyboard',
                                )
                            }
                        >
                            <MantineIcon icon={IconCheck} size={14} />
                        </ActionIcon>
                        <ActionIcon
                            size="xs"
                            radius="xl"
                            aria-label="Discard"
                            tabIndex={-1}
                            onClick={(event) =>
                                finish(
                                    '',
                                    event.detail > 0 ? 'pointer' : 'keyboard',
                                )
                            }
                        >
                            <MantineIcon icon={IconX} size={14} />
                        </ActionIcon>
                    </Group>
                }
                value={value}
                onChange={(event) => setValue(event.currentTarget.value)}
                autoFocus
                data-own-escape
                onBlur={(event) =>
                    finish(
                        event.currentTarget.value,
                        event.relatedTarget instanceof HTMLElement &&
                            event.relatedTarget !== document.body
                            ? 'elsewhere'
                            : 'pointer',
                    )
                }
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        finish(event.currentTarget.value, 'keyboard');
                    } else if (event.key === 'Escape') {
                        event.preventDefault();
                        finish('', 'keyboard');
                    }
                }}
            />
        </Box>
    );
};

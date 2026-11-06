import { TextInput } from '@mantine/core';
import { useRef, useState, type FC } from 'react';
import { type NameExit } from './nameFocus';

// A control's name, and its rename: blur and Enter commit, Escape reverts
export const NameInput: FC<{
    initial: string;
    placeholder: string;
    onCommit: (text: string) => void;
    onDone: (how: NameExit) => void;
}> = ({ initial, placeholder, onCommit, onDone }) => {
    const [draft, setDraft] = useState(initial);
    const isDone = useRef(false);
    const finish = (text: string, how: NameExit) => {
        if (isDone.current) return;
        isDone.current = true;
        onCommit(text);
        onDone(how);
    };
    return (
        <TextInput
            aria-label="Name"
            data-controls-label
            size="xs"
            flex={1}
            miw={0}
            placeholder={placeholder}
            data-own-escape
            autoFocus
            value={draft}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={(event) =>
                finish(
                    draft,
                    event.relatedTarget instanceof HTMLElement &&
                        event.relatedTarget !== document.body
                        ? 'elsewhere'
                        : 'pointer',
                )
            }
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    finish(draft, 'keyboard');
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    finish(initial, 'keyboard');
                }
            }}
        />
    );
};

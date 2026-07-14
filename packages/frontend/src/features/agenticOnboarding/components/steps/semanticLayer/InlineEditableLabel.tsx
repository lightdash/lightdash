import { Text, TextInput, UnstyledButton } from '@mantine-8/core';
import { useState, type FC } from 'react';

type InlineEditableLabelProps = {
    value: string;
    onCommit: (nextValue: string) => void;
    ariaLabel: string;
    disabled?: boolean;
};

const InlineEditableLabel: FC<InlineEditableLabelProps> = ({
    value,
    onCommit,
    ariaLabel,
    disabled = false,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(value);

    const commit = () => {
        setIsEditing(false);
        const trimmed = draft.trim();
        if (trimmed && trimmed !== value) {
            onCommit(trimmed);
        } else {
            setDraft(value);
        }
    };

    if (isEditing) {
        return (
            <TextInput
                size="xs"
                autoFocus
                aria-label={ariaLabel}
                value={draft}
                onChange={(event) => setDraft(event.currentTarget.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        commit();
                    } else if (event.key === 'Escape') {
                        event.preventDefault();
                        setDraft(value);
                        setIsEditing(false);
                    }
                }}
            />
        );
    }

    return (
        <UnstyledButton
            aria-label={`Edit ${ariaLabel}`}
            disabled={disabled}
            onClick={() => {
                if (disabled) return;
                setDraft(value);
                setIsEditing(true);
            }}
        >
            <Text size="sm" fw={500}>
                {value}
            </Text>
        </UnstyledButton>
    );
};

export default InlineEditableLabel;

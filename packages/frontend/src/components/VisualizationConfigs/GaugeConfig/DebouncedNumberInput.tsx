import { useDebouncedCallback } from '@mantine/hooks';
import { useState, type FC } from 'react';
import { NumberInput, type NumberInputProps } from '../../common/NumberInput';

type Props = Omit<NumberInputProps, 'value' | 'onNumberChange' | 'onChange'> & {
    value: number | undefined;
    onCommit: (value: number | undefined) => void;
};

/** Keeps a local draft and commits it to the store debounced */
export const DebouncedNumberInput: FC<Props> = ({
    value,
    onCommit,
    ...rest
}) => {
    const [draft, setDraft] = useState(value);
    const [seen, setSeen] = useState(value);
    const commit = useDebouncedCallback(onCommit, {
        delay: 300,
        flushOnUnmount: true,
    });
    // A change from outside (a reset, a removed section shifting up) wins
    if (value !== seen) {
        setSeen(value);
        setDraft(value);
        commit.cancel();
    }
    return (
        <NumberInput
            {...rest}
            value={draft ?? ''}
            onNumberChange={(next) => {
                setDraft(next);
                commit(next);
            }}
        />
    );
};

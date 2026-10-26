import { useDebouncedCallback } from '@mantine/hooks';
import { useState, type ComponentProps, type FC } from 'react';
import ColorSelector from '../../ColorSelector';

type Props = ComponentProps<typeof ColorSelector> & {
    onColorChange: (newColor: string) => void;
};

/** A colour picker that shows its draft at once and commits it debounced */
export const DebouncedColorSelector: FC<Props> = ({
    color,
    onColorChange,
    onColorReset,
    ...props
}) => {
    const [draftColor, setDraftColor] = useState<string>();
    const commit = useDebouncedCallback(
        (newColor: string) => {
            onColorChange(newColor);
            setDraftColor(undefined);
        },
        { delay: 300, flushOnUnmount: true },
    );
    return (
        <ColorSelector
            {...props}
            color={draftColor ?? color}
            onColorChange={(newColor) => {
                setDraftColor(newColor);
                commit(newColor);
            }}
            onColorReset={
                onColorReset
                    ? () => {
                          commit.cancel();
                          setDraftColor(undefined);
                          onColorReset();
                      }
                    : undefined
            }
        />
    );
};

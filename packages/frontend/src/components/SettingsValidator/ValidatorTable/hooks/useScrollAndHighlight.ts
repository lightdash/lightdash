import { type MantineThemeColors } from '@mantine/core';
import { useEffect, type RefObject } from 'react';

export const useScrollAndHighlight = (
    refs: { [key: string]: RefObject<HTMLTableRowElement> },
    validationId: string | null,
    colors: MantineThemeColors,
) => {
    useEffect(() => {
        if (validationId) {
            refs[validationId]?.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });

            refs[validationId]?.current?.animate(
                [
                    { backgroundColor: 'white' },
                    { backgroundColor: colors.gray[3] },
                    { backgroundColor: 'white' },
                ],
                {
                    duration: 1000,
                    iterations: 2,
                },
            );
        }
    }, [refs, validationId, colors]);
};

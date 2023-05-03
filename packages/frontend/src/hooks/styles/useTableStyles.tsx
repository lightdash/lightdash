import { createStyles, CSSObject } from '@mantine/core';

export const useTableStyles = (overrideStyles?: Record<string, CSSObject>) =>
    createStyles((theme) => {
        const defaultStyles: Record<string, CSSObject> = {
            '& thead tr': {
                backgroundColor: theme.colors.gray[0],
            },

            '& thead tr th': {
                color: theme.colors.gray[6],
                fontWeight: 600,
            },

            '& thead tr th, & tbody tr td': {
                padding: '12px 20px',
            },

            '&[data-hover] tbody tr': theme.fn.hover({
                cursor: 'pointer',
                backgroundColor: theme.fn.rgba(theme.colors.gray[0], 0.5),
            }),
        };

        if (overrideStyles) {
            Object.keys(overrideStyles).forEach((key) => {
                if (key in defaultStyles) {
                    defaultStyles[key] = {
                        ...defaultStyles[key],
                        ...overrideStyles[key],
                    };
                } else {
                    defaultStyles[key] = overrideStyles[key];
                }
            });
        }

        return { root: defaultStyles };
    });

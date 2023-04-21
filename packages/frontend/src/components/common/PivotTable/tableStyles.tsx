import { createStyles } from '@mantine/core';
import { darken } from 'polished';

export const usePivotTableStyles = createStyles((theme) => ({
    root: {
        backgroundColor: theme.colors.gray[3],

        'td, th': {
            paddingLeft: theme.spacing.sm,
            paddingRight: theme.spacing.sm,
            paddingTop: theme.spacing.xs,
            paddingBottom: theme.spacing.xs,
        },

        tbody: {
            'tr:hover': {
                td: {
                    '&:not([data-expanded="true"]):not([data-conditional-formatting="true"])':
                        {
                            backgroundColor: theme.colors.gray[0],
                        },
                },
            },
        },
    },
}));

type PivotTableCellStylesProps = {
    conditionalFormatting?: {
        backgroundColor: string;
        color: string;
    };
    hasValue?: boolean;
};

export const usePivotTableCellStyles = createStyles<
    string,
    PivotTableCellStylesProps
>((theme, props) => ({
    root: {
        textAlign: 'left',
        whiteSpace: 'nowrap',
        fontWeight: 400,

        cursor: props.hasValue ? 'pointer' : 'default',

        color: theme.colors.gray[7],
        backgroundColor: theme.white,

        outline: `1px solid transparent`,

        transitionProperty: 'color, background-color, border-color, outline',
        transitionDuration: '200ms',
        transitionTimingFunction: 'ease-in-out',

        '&[data-expanded="true"]': {
            backgroundColor: theme.colors.blue[0],
            outline: `1px solid ${theme.colors.blue[6]}`,
        },

        '&[data-copied="true"]': {
            color: theme.black,
            backgroundColor: theme.colors.blue[2],
            outline: `1px solid ${theme.colors.blue[9]}`,
        },

        ':hover:not([data-expanded="true"]):not([data-copied="true"])':
            props.hasValue
                ? {
                      outline: `1px solid ${theme.colors.gray[6]}`,
                  }
                : undefined,
    },

    header: {
        fontWeight: 600,
        color: theme.colors.gray[8],
        backgroundColor: theme.colors.gray[5],
    },

    conditionalFormatting: props.conditionalFormatting
        ? {
              color: props.conditionalFormatting?.color,
              backgroundColor: props.conditionalFormatting?.backgroundColor,

              '&[data-expanded="true"]:not([data-copied="true"])': {
                  backgroundColor: darken(0.1)(
                      props.conditionalFormatting.backgroundColor,
                  ),

                  outline: `1px solid ${darken(0.3)(
                      props.conditionalFormatting.backgroundColor,
                  )}`,
              },
          }
        : {},

    rowNumber: {
        width: '1%',
        textAlign: 'right',
    },
}));

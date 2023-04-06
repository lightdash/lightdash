import { createStyles } from '@mantine/core';
import { darken } from 'polished';

export const usePivotTableStyles = createStyles((theme) => ({
    root: {
        backgroundColor: theme.colors.gray[3],

        'td, th': {
            paddingLeft: theme.spacing.xs,
            paddingRight: theme.spacing.xs,
            paddingTop: theme.spacing.xxs,
            paddingBottom: theme.spacing.xxs,
        },
    },
}));

type PivotTableCellStylesProps = {
    conditionalFormatting?: {
        backgroundColor: string;
        color: string;
    };
};

export const usePivotTableCellStyles = createStyles<
    string,
    PivotTableCellStylesProps
>((theme, props) => ({
    root: {
        textAlign: 'left',
        whiteSpace: 'nowrap',
        fontWeight: 400,

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
        },
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

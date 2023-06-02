import { createStyles } from '@mantine/core';
import { darken } from 'polished';
import { isHexCodeColor } from '../../../utils/colorUtils';

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
                            backgroundColor: theme.colors.gray[1],
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
};

export const usePivotTableCellStyles = createStyles<
    string,
    PivotTableCellStylesProps
>((theme, props = {}) => ({
    root: {
        textAlign: 'left',
        whiteSpace: 'nowrap',
        fontWeight: 400,
        fontSize: 13,

        color: theme.colors.gray[9],
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
    },

    conditionalFormatting: props.conditionalFormatting
        ? {
              color: props.conditionalFormatting?.color,
              backgroundColor: props.conditionalFormatting?.backgroundColor,

              '&[data-expanded="true"]:not([data-copied="true"])': {
                  backgroundColor: isHexCodeColor(
                      props.conditionalFormatting.backgroundColor,
                  )
                      ? darken(0.1)(props.conditionalFormatting.backgroundColor)
                      : undefined,

                  outline: isHexCodeColor(
                      props.conditionalFormatting.backgroundColor,
                  )
                      ? `1px solid ${darken(0.3)(
                            props.conditionalFormatting.backgroundColor ?? '',
                        )}`
                      : undefined,
              },
          }
        : {},

    withGrayBackground: {
        backgroundColor: theme.colors.gray[0],
    },

    withBolderFont: {
        fontWeight: 600,
    },

    withLighterBoldFont: {
        fontWeight: 500,
    },

    withAlignRight: {
        textAlign: 'right',
    },

    withMinimalWidth: {
        width: '1%',
    },

    withValue: {
        cursor: 'pointer',
        ':hover:not([data-expanded="true"]):not([data-copied="true"])': {
            outline: `1px solid ${theme.colors.gray[6]}`,
        },
    },
}));

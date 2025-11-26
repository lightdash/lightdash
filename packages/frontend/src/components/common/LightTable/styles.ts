import { assertUnreachable } from '@lightdash/common';
import { createStyles, type MantineTheme } from '@mantine/core';
import { darken, rgba } from 'polished';
import { CELL_HEIGHT } from './constants';
import { CellType, SectionType } from './types';

const getBorderColor = (theme: MantineTheme) => theme.colors.ldGray[3];
const getShadowColor = (theme: MantineTheme) => rgba(theme.black, 0.075);

export const useTableStyles = createStyles((theme) => {
    const borderColor = getBorderColor(theme);

    return {
        root: {
            borderCollapse: 'initial',
            borderSpacing: 0,

            borderRadius: '4px',

            margin: 0,
            padding: 0,

            /* All cells have right and bottom borders (inner borders only) */
            'th, td': {
                transitionDuration: '200ms',
                transitionProperty: 'box-shadow, background-color',
                transitionTimingFunction: 'ease-out',

                boxShadow: `inset -1px -1px 0 0 ${borderColor}`,
                '&:hover': {
                    boxShadow: `inset -1px -1px 0 0 ${borderColor} !important`,
                    backgroundColor: theme.colors.ldGray[1],
                    transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                },
            },

            /* First row cells: no top border (table border provides it) */
            '> *:first-child > *:first-child > *': {
                boxShadow: `inset -1px -1px 0 0 ${borderColor}`,
            },

            /* First row, first cell: no top or left border (table border provides them) */
            '> *:first-child > *:first-child > *:first-child': {
                boxShadow: `inset -1px -1px 0 0 ${borderColor}`,
            },

            /* First row, last cell: no top or right border (table border provides them) */
            '> *:first-child > *:first-child > *:last-child': {
                boxShadow: `inset 0 -1px 0 0 ${borderColor}`,
                '&:hover': {
                    boxShadow: `inset 0 -1px 0 0 ${borderColor} !important`,
                },
            },

            /* First column cells: no left border (container provides it) */
            '> * > tr > *:first-child': {
                boxShadow: `inset -1px -1px 0 0 ${borderColor}`,
            },

            /* Last column cells: no right border (container provides it) */
            '> * > tr > *:last-child': {
                boxShadow: `inset 0 -1px 0 0 ${borderColor}`,
                '&:hover': {
                    boxShadow: `inset 0 -1px 0 0 ${borderColor} !important`,
                },
            },

            /* Body last row cells: no bottom border (container provides it) */
            '> tbody:last-child > *:last-child > *': {
                boxShadow: `inset -1px 0 0 0 ${borderColor}`,
                '&:hover': {
                    boxShadow: `inset -1px 0 0 0 ${borderColor} !important`,
                },
            },

            /* Body last row, last cell: no right or bottom border */
            '> tbody:last-child > *:last-child > *:last-child': {
                boxShadow: 'none',
                '&:hover': {
                    boxShadow: 'none !important',
                },
            },

            /* Body last row, first cell: no left or bottom border */
            '> tbody:last-child > *:last-child > *:first-child': {
                boxShadow: 'none',
                '&:hover': {
                    boxShadow: 'none !important',
                },
            },

            /* Footer last row cells: no bottom border (container provides it) */
            '> tfoot:last-child > *:last-child > *': {
                boxShadow: `inset -1px 0 0 0 ${borderColor}`,
                '&:hover': {
                    boxShadow: `inset -1px 0 0 0 ${borderColor} !important`,
                },
            },

            /* Footer last row, last cell: no right or bottom border */
            '> tfoot:last-child > *:last-child > *:last-child': {
                boxShadow: 'none',
                '&:hover': {
                    boxShadow: 'none !important',
                },
            },

            /* Footer last row, first cell: no left or bottom border */
            '> tfoot:last-child > *:last-child > *:first-child': {
                boxShadow: 'none',
                '&:hover': {
                    boxShadow: 'none !important',
                },
            },
        },
    };
});

export const useTableSectionStyles = createStyles<
    string,
    {
        sectionType: SectionType;
        scrollPositions: {
            isAtTop: boolean;
            isAtBottom: boolean;
        };
        withSticky: boolean;
    }
>((theme, { withSticky, sectionType, scrollPositions }) => {
    const borderColor = getBorderColor(theme);
    const shadowColor = getShadowColor(theme);

    const getStickyCellShadowStyles = () => {
        if (!withSticky) return {};

        switch (sectionType) {
            case SectionType.Head:
                return {
                    '& tr:last-child': {
                        transition: 'box-shadow 500ms ease',
                        boxShadow: scrollPositions.isAtTop
                            ? 'none'
                            : `0 4px 4px 0 ${shadowColor}`,
                    },
                };

            case SectionType.Footer:
                return {
                    '& tr:first-child': {
                        transition: 'box-shadow 500ms ease',
                        boxShadow: scrollPositions.isAtBottom
                            ? 'none'
                            : `0 -4px 4px 0 ${shadowColor}, 0 -1px 0 0 ${borderColor}`,
                    },
                };

            case SectionType.Body:
                return {};

            default:
                return assertUnreachable(
                    sectionType,
                    `unknown section type: ${sectionType}`,
                );
        }
    };

    const getStickySectionStyles = () => {
        if (!withSticky) return {};

        switch (sectionType) {
            case SectionType.Head:
                return {
                    top: 0,
                    position: 'sticky',
                    zIndex: 1,
                } as const;

            case SectionType.Footer:
                return {
                    bottom: 0,
                    position: 'sticky',
                    zIndex: 1,
                } as const;

            case SectionType.Body:
                return {};

            default:
                return assertUnreachable(
                    sectionType,
                    `unknown section type: ${sectionType}`,
                );
        }
    };

    return {
        root: {
            ...getStickyCellShadowStyles(),
        },

        withSticky: getStickySectionStyles(),
    };
});

export const useTableRowStyles = createStyles<
    string,
    { sectionType: SectionType; index: number }
>((theme, { sectionType, index }) => {
    const rowHoverBackground = rgba(theme.colors.ldGray[0], 0.5);

    const getStickySectionStyles = () => {
        switch (sectionType) {
            case SectionType.Head:
                return {
                    top: index * CELL_HEIGHT,
                } as const;

            case SectionType.Footer:
                return {
                    bottom: index * CELL_HEIGHT,
                } as const;

            case SectionType.Body:
                // we don't want to apply sticky styles to body rows
                return null;

            default:
                return assertUnreachable(
                    sectionType,
                    `unknown section type: ${sectionType}`,
                );
        }
    };

    return {
        root: {
            backgroundColor: theme.colors.background[0],

            ':hover':
                sectionType === SectionType.Body
                    ? {
                          backgroundColor: rowHoverBackground,
                      }
                    : {},
        },

        withSticky: {
            position: 'sticky',
            zIndex: 1,
            ...getStickySectionStyles(),
        },
    };
});

export const useTableCellStyles = createStyles<
    string,
    {
        sectionType: SectionType;
        cellType: CellType;
        index: number;
        withColor: string | false;
        withBackground: string | false;
    }
>(
    (
        theme,
        {
            sectionType,
            cellType,
            index,
            withColor = false,
            withBackground = false,
        },
    ) => {
        const cellHeadBackground = theme.colors.ldGray[0];
        const selectedDefaultBackground =
            theme.colorScheme === 'dark'
                ? theme.colors.blue[9]
                : theme.colors.blue[2];
        const selectedDefaultBorder =
            theme.colorScheme === 'dark'
                ? theme.colors.blue[5]
                : theme.colors.blue[4];
        const copyingBackground =
            theme.colorScheme === 'dark'
                ? theme.colors.blue[8]
                : theme.colors.blue[3];
        const withBackgroundSelected = withBackground
            ? darken(0.05, withBackground)
            : undefined;
        const withBackgroundBorderSelected = withBackground
            ? darken(0.2, withBackground)
            : undefined;
        const withBackgroundBorder = withBackground
            ? darken(0.03, withBackground)
            : undefined;

        const getStickySectionCellStyles = () => {
            switch (sectionType) {
                case SectionType.Head:
                    return {
                        top: index * CELL_HEIGHT,
                    } as const;

                case SectionType.Footer:
                    return {
                        bottom: index * CELL_HEIGHT,
                    } as const;

                case SectionType.Body:
                    // we don't want to apply sticky styles to body cells
                    return null;

                default:
                    return assertUnreachable(
                        sectionType,
                        `unknown section type: ${sectionType}`,
                    );
            }
        };

        return {
            root: {
                position: 'relative',

                paddingLeft: theme.spacing.sm,
                paddingRight: theme.spacing.sm,

                height: CELL_HEIGHT,

                textAlign: 'left',
                whiteSpace: 'pre',

                fontFamily: theme.other.tableFont ?? "'Inter', sans-serif",
                fontFeatureSettings: '"tnum"',
                fontWeight: cellType === CellType.Head ? 500 : 400,
                fontSize: 13,

                color: theme.colors.ldGray[9],

                backgroundColor:
                    cellType === CellType.Head ? cellHeadBackground : undefined,
            },

            withMinimalWidth: {
                width: '1%',
            },

            withLargeContent: {
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                maxWidth: '300px',
                whiteSpace: 'pre',

                '&:hover, &[data-is-selected="true"]': {
                    overflow: 'visible',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    minWidth: '300px',
                },
            },

            withAlignRight: {
                textAlign: 'right',
            },

            withBoldFont: {
                fontWeight: 600,
            },

            withCopying: {
                backgroundColor: copyingBackground,
                boxShadow: `inset 0 0 0 1px ${selectedDefaultBorder}, inset 0 0 1px 0 ${selectedDefaultBorder} !important`,
            },

            withColor: withColor
                ? {
                      color: withColor,
                  }
                : {},

            withInteractions: {
                cursor: 'pointer',

                '&:hover, &[data-is-selected="true"]': {
                    backgroundColor: selectedDefaultBackground,
                    boxShadow: `inset 0 0 0 1px ${selectedDefaultBorder}, inset 0 0 1px 0 ${selectedDefaultBorder} !important`,
                },
            },

            withBackground: withBackground
                ? {
                      backgroundColor: withBackground,
                      boxShadow: `inset 0 0 0 1px ${withBackgroundBorder}, inset 0 0 1px 0 ${withBackgroundBorderSelected} !important`,

                      '&:hover, &[data-is-selected="true"]': {
                          backgroundColor: withBackgroundSelected,
                          boxShadow: `inset 0 0 0 1px ${withBackgroundBorderSelected}, inset 0 0 1px 0 ${withBackgroundBorderSelected} !important`,
                      },
                  }
                : {},

            withSticky: {
                position: 'sticky',
                zIndex: 1,
                ...getStickySectionCellStyles(),
            },
        };
    },
);

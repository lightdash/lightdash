import { assertUnreachable } from '@lightdash/common';
import { createStyles, MantineTheme } from '@mantine/core';
import { darken, rgba } from 'polished';
import { CellType, SectionType } from '.';

export const CELL_HEIGHT = 32;

const getBorderColor = (theme: MantineTheme) => theme.colors.gray[3];
const getShadowColor = (theme: MantineTheme) => rgba(theme.black, 0.075);

export const useTableStyles = createStyles((theme) => {
    const borderColor = getBorderColor(theme);

    return {
        root: {
            borderCollapse: 'initial',
            borderSpacing: 0,

            margin: 0,
            padding: 0,

            'th, td': {
                boxShadow: `inset -1px -1px 0 0 ${borderColor}`,
            },

            '& > *:first-child > *:first-child > *': {
                boxShadow: `inset 0 1px 0 0 ${borderColor}, inset -1px -1px 0 0 ${borderColor}`,
            },

            '& > *:first-child > *:first-child > *:first-child': {
                boxShadow: `inset 1px 1px 0 0 ${borderColor}, inset -1px -1px 0 0 ${borderColor}`,
            },

            '& > * > tr > *:first-child': {
                boxShadow: `inset 1px 0 0 0 ${borderColor}, inset -1px -1px 0 0 ${borderColor}`,
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
    }
>((theme, { sectionType, scrollPositions }) => {
    const borderColor = getBorderColor(theme);
    const shadowColor = getShadowColor(theme);

    const stickyShadow = (() => {
        switch (sectionType) {
            case SectionType.Head:
                return {
                    '& tr:last-of-type': {
                        transition: 'box-shadow 500ms ease',
                        boxShadow: scrollPositions.isAtTop
                            ? 'none'
                            : `0 4px 4px 0 ${shadowColor}`,
                    },
                };

            case SectionType.Footer:
                return {
                    '& tr:first-of-type': {
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
    })();

    return {
        root: {
            ...stickyShadow,
        },
    };
});

export const useTableRowStyles = createStyles<
    string,
    { sectionType: SectionType; index: number }
>((theme, { sectionType, index }) => {
    const rowHoverBackground = rgba(theme.colors.gray[0], 0.5);

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
            backgroundColor: theme.white,

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
        isSelected: boolean;
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
            isSelected = false,
            withColor = false,
            withBackground = false,
        },
    ) => {
        const cellHeadBackground = theme.colors.gray[0];
        const selectedCellBackground = theme.colors.blue[2];

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
                overflow: 'visible',

                paddingLeft: theme.spacing.sm,
                paddingRight: theme.spacing.sm,

                height: CELL_HEIGHT,
                maxWidth: '300px',

                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',

                textAlign: 'left',

                fontFamily: "'Inter', sans-serif",
                fontFeatureSettings: '"tnum"',
                fontWeight: cellType === CellType.Head ? 500 : 400,
                fontSize: 13,

                color: theme.colors.gray[9],

                backgroundColor:
                    cellType === CellType.Head
                        ? cellHeadBackground
                        : 'transparent',
            },

            floatingElement: {
                pointerEvents: 'none',
                position: 'absolute',
                zIndex: -1,

                top: -1,
                left: -1,
                right: 0,
                bottom: 0,

                backgroundColor: isSelected
                    ? selectedCellBackground
                    : undefined,

                border: isSelected
                    ? `1px solid ${theme.colors.blue[6]}`
                    : undefined,
            },

            withAlignRight: {
                textAlign: 'right',
            },

            withBoldFont: {
                fontWeight: 600,
            },

            withInteractions: {
                cursor: 'pointer',

                '&:hover': !isSelected
                    ? {
                          borderColor: theme.colors.gray[6],
                      }
                    : {},
            },

            withCopying: {
                backgroundColor: theme.colors.blue[2],
            },

            withColor: withColor
                ? {
                      color: withColor,
                  }
                : {},

            withBackground: withBackground
                ? isSelected
                    ? {
                          backgroundColor: darken(0.05, withBackground),
                          borderColor: darken(0.2, withBackground),
                          boxShadow: `inset 0 0 0 1.5px ${darken(
                              0.2,
                              withBackground,
                          )}`,
                      }
                    : {
                          backgroundColor: withBackground,
                          borderColor: darken(0.1, withBackground),

                          '&:hover': {
                              backgroundColor: darken(0.05, withBackground),
                              borderColor: darken(0.15, withBackground),
                              boxShadow: `inset 0 0 0 0.5px ${darken(
                                  0.1,
                                  withBackground,
                              )}`,
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

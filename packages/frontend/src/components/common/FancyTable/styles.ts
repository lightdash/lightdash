import { assertUnreachable } from '@lightdash/common';
import { createStyles } from '@mantine/core';
import { darken } from 'polished';
import { CellType, SectionType } from '.';

export const CELL_HEIGHT = 32;

export const useTableStyles = createStyles(() => ({
    root: {
        borderCollapse: 'initial',
        borderSpacing: 0,

        margin: 0,
        padding: 0,
    },
}));

export const useTableSectionStyles = createStyles<
    string,
    {
        sectionType: SectionType;
        scrollPositions: {
            isAtTop: boolean;
            isAtBottom: boolean;
        };
    }
>((_theme, { sectionType, scrollPositions }) => {
    const stickyShadow = (() => {
        switch (sectionType) {
            case SectionType.Head:
                return {
                    '& tr:last-of-type': {
                        transition: 'box-shadow 500ms ease',
                        boxShadow: scrollPositions.isAtTop
                            ? 'none'
                            : `0 4px 4px 0 rgba(0, 0, 0, 0.075)`,
                    },
                };

            case SectionType.Footer:
                return {
                    '& tr:first-of-type': {
                        transition: 'box-shadow 500ms ease',
                        boxShadow: scrollPositions.isAtBottom
                            ? 'none'
                            : `0 -4px 4px 0 rgba(0, 0, 0, 0.075)`,
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
>((_theme, { sectionType, index }) => {
    const withSticky = (() => {
        switch (sectionType) {
            case SectionType.Head:
                return {
                    position: 'sticky',
                    top: index * CELL_HEIGHT,
                    zIndex: 1,
                } as const;

            case SectionType.Footer:
                return {
                    position: 'sticky',
                    bottom: index * CELL_HEIGHT,
                    zIndex: 1,
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
    })();

    return {
        root: {},
        ...(withSticky ? { withSticky } : {}),
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
        const withSticky = (() => {
            switch (sectionType) {
                case SectionType.Head:
                    return {
                        position: 'sticky',
                        top: index * CELL_HEIGHT,
                        zIndex: 1,
                    } as const;

                case SectionType.Footer:
                    return {
                        position: 'sticky',
                        bottom: index * CELL_HEIGHT,
                        zIndex: 1,
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
        })();

        return {
            root: {
                position: 'relative',
                zIndex: 0,

                height: CELL_HEIGHT,

                paddingLeft: theme.spacing.sm,
                paddingRight: theme.spacing.sm,

                textAlign: 'left',

                fontFamily: "'Inter', sans-serif",
                fontFeatureSettings: '"tnum"',
                fontWeight: cellType === CellType.Head ? 500 : 400,
                fontSize: 13,

                maxWidth: '300px',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden',

                color: theme.colors.gray[9],

                backgroundColor:
                    cellType === CellType.Head
                        ? theme.colors.gray[0]
                        : theme.white,
            },

            floatingElement: {
                position: 'absolute',
                zIndex: -1,
                top: -0.5,
                left: -0.5,
                right: -0.5,
                bottom: -0.5,

                transitionProperty:
                    'background-color, border-color, box-shadow',
                transitionDuration: '200ms',
                transitionTimingFunction: 'ease-out',

                borderStyle: 'solid',
                borderWidth: 1,
                borderColor: isSelected
                    ? theme.colors.blue[6]
                    : theme.colors.gray[3],
                boxShadow: isSelected
                    ? `inset 0 0 0 1.5px ${theme.colors.blue[6]}`
                    : 'none',

                backgroundColor: isSelected ? theme.colors.blue[0] : 'none',
            },

            withAlignRight: {
                textAlign: 'right',
            },

            withBoldFont: {
                fontWeight: 600,
            },

            withInteractions: !isSelected
                ? {
                      '&:hover': {
                          borderColor: theme.colors.gray[6],
                          boxShadow: `inset 0 0 0 0.5px ${theme.colors.gray[6]}`,
                      },
                  }
                : {},

            withCopying: isSelected
                ? {
                      backgroundColor: theme.colors.blue[2],
                  }
                : {},

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

            ...(withSticky ? { withSticky } : {}),
        };
    },
);

import { assertUnreachable } from '@lightdash/common';
import { createStyles } from '@mantine/core';
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
                            : `0 3px 3px 0 rgba(0, 0, 0, 0.1)`,
                    },
                };

            case SectionType.Footer:
                return {
                    '& tr:first-of-type': {
                        transition: 'box-shadow 500ms ease',
                        boxShadow: scrollPositions.isAtBottom
                            ? 'none'
                            : `0 -3px 3px 0 rgba(0, 0, 0, 0.1)`,
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
    }
>((theme, { sectionType, cellType, index, isSelected }) => {
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
            paddingTop: 0,
            paddingBottom: 0,

            textAlign: 'left',

            fontFamily: "'Inter', sans-serif",
            fontWeight: cellType === CellType.Head ? 500 : 400,
            fontSize: 13,

            maxWidth: '300px',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',

            color: theme.colors.gray[9],

            backgroundColor:
                cellType === CellType.Head ? theme.colors.gray[0] : theme.white,
        },

        ...(withSticky ? { withSticky } : {}),

        borders: {
            position: 'absolute',
            zIndex: -1,
            top: -0.5,
            left: -0.5,
            right: -0.5,
            bottom: -0.5,

            borderStyle: 'solid',
            borderWidth: isSelected ? 2 : 1,
            borderColor: isSelected
                ? theme.colors.blue[3]
                : theme.colors.gray[3],
        },

        withAlignRight: {
            textAlign: 'right',
        },

        withBoldFont: {
            fontWeight: 600,
        },
    };
});

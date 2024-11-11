import { isEmojiIcon, type CatalogField } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    getDefaultZIndex,
    Group,
    Highlight,
    Paper,
    Portal,
} from '@mantine/core';
import { useClickOutside } from '@mantine/hooks';
import EmojiPicker, {
    Emoji,
    EmojiStyle,
    type EmojiClickData,
} from 'emoji-picker-react';
import { type MRT_Row, type MRT_TableInstance } from 'mantine-react-table';
import { forwardRef, useCallback, useEffect, useState, type FC } from 'react';
import MetricIconPlaceholder from '../../../svgs/metrics-catalog-metric-icon.svg?react';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useUpdateCatalogItemIcon } from '../hooks/useCatalogCategories';

const PICKER_HEIGHT = 400;

const SharedEmojiPicker = forwardRef(
    (
        {
            position,
            onClick,
        }: {
            position: { top: number; left: number } | null;
            onClick: (emoji: EmojiClickData) => void;
        },
        ref: React.ForwardedRef<HTMLDivElement>,
    ) => {
        if (!position) return null;

        return (
            <Portal>
                <Box
                    ref={ref}
                    pos="fixed"
                    top={position.top}
                    left={position.left}
                    sx={{
                        zIndex: getDefaultZIndex('overlay'),
                    }}
                >
                    <Paper shadow="md" pos="relative">
                        {/* <Text fw={500} size="sm" ta="center">
                            Coming soon
                        </Text> */}

                        {/* TODO: display loader on emoji picker loading */}
                        <EmojiPicker
                            height={PICKER_HEIGHT}
                            style={
                                {
                                    // pointerEvents: 'none',
                                    // opacity: 0.5,
                                }
                            }
                            onEmojiClick={onClick}
                            // TODO: Add onEmojiClick
                            previewConfig={undefined}
                            lazyLoadEmojis
                            emojiStyle={EmojiStyle.NATIVE}
                            searchDisabled
                        />
                    </Paper>
                </Box>
            </Portal>
        );
    },
);

type Props = {
    row: MRT_Row<CatalogField>;
    table: MRT_TableInstance<CatalogField>;
};

export const MetricsCatalogColumnName: FC<Props> = ({ row, table }) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    if (row.original.icon) {
        console.log(row.original);
    }
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerPosition, setPickerPosition] = useState<{
        top: number;
        left: number;
    } | null>(null);
    const [iconRef, setIconRef] = useState<HTMLButtonElement | null>(null);
    const [pickerRef, setPickerRef] = useState<HTMLDivElement | null>(null);

    useEffect(
        function lockScroll() {
            const tableContainer = table.refs.tableContainerRef.current;
            if (tableContainer && isPickerOpen) {
                tableContainer.style.overflow = 'hidden';
            }
            return () => {
                if (tableContainer) {
                    tableContainer.style.overflow = 'auto';
                }
            };
        },
        [isPickerOpen, table.refs.tableContainerRef],
    );

    const handleClosePicker = useCallback(() => {
        setIsPickerOpen(false);
        setPickerPosition(null);
    }, []);

    useClickOutside(handleClosePicker, null, [iconRef, pickerRef]);

    const { mutate: updateCatalogItemIcon } = useUpdateCatalogItemIcon();

    const handleIconClick = (e: React.MouseEvent) => {
        if (isPickerOpen) {
            return handleClosePicker();
        }
        const rect = e.currentTarget.getBoundingClientRect();

        // Get viewport height and picker approximate height (400px is typical for emoji picker)
        const viewportHeight = window.innerHeight;
        const pickerHeight = PICKER_HEIGHT;

        // Check if there's enough space below
        const spaceBelow = viewportHeight - rect.bottom;
        const shouldShowAbove = spaceBelow < pickerHeight;

        setPickerPosition({
            top: shouldShowAbove
                ? rect.top - pickerHeight - 5
                : rect.bottom + 5,
            left: rect.left,
        });
        setIsPickerOpen(true);
    };

    const handleOnClick = (emoji: EmojiClickData) => {
        if (!projectUuid) return;
        updateCatalogItemIcon({
            projectUuid,
            catalogSearchUuid: row.original.catalogSearchUuid,
            icon: emoji.isCustom
                ? {
                      url: emoji.imageUrl,
                  }
                : {
                      unicode: emoji.unified,
                  },
        });
        handleClosePicker();
    };

    return (
        <>
            <Group noWrap spacing="xs">
                <ActionIcon
                    ref={setIconRef}
                    variant="default"
                    w={25}
                    h={25}
                    radius="sm"
                    p="two"
                    sx={{ flexShrink: 0 }}
                    onClick={handleIconClick}
                >
                    {isEmojiIcon(row.original.icon) ? (
                        <Emoji unified={row.original.icon.unicode} />
                    ) : (
                        <MetricIconPlaceholder width="100%" height="100%" />
                    )}
                </ActionIcon>
                <Highlight highlight={table.getState().globalFilter || ''}>
                    {row.original.label}
                </Highlight>
            </Group>
            <SharedEmojiPicker
                position={pickerPosition}
                ref={setPickerRef}
                onClick={handleOnClick}
            />
        </>
    );
};

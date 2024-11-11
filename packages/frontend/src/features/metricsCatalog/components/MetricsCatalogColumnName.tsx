import { type CatalogField } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    getDefaultZIndex,
    Group,
    Highlight,
    Paper,
    Portal,
    Text,
} from '@mantine/core';
import { useClickOutside } from '@mantine/hooks';
import EmojiPicker, { EmojiStyle } from 'emoji-picker-react';
import { type MRT_Row, type MRT_TableInstance } from 'mantine-react-table';
import { forwardRef, useCallback, useEffect, useState, type FC } from 'react';
import MetricIconPlaceholder from '../../../svgs/metrics-catalog-metric-icon.svg?react';

const SharedEmojiPicker = forwardRef(
    (
        {
            position,
        }: {
            position: { top: number; left: number } | null;
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
                        <Text fw={500} size="sm" ta="center">
                            Coming soon
                        </Text>

                        {/* TODO: display loader on emoji picker loading */}
                        <EmojiPicker
                            style={{
                                pointerEvents: 'none',
                                opacity: 0.5,
                            }}
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

    const handleIconClick = (e: React.MouseEvent) => {
        if (isPickerOpen) {
            return handleClosePicker();
        }
        const rect = e.currentTarget.getBoundingClientRect();
        setPickerPosition({
            top: rect.bottom + 5,
            left: rect.left,
        });
        setIsPickerOpen(true);
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
                    <MetricIconPlaceholder width="100%" height="100%" />
                </ActionIcon>
                <Highlight highlight={table.getState().globalFilter || ''}>
                    {row.original.label}
                </Highlight>
            </Group>
            <SharedEmojiPicker position={pickerPosition} ref={setPickerRef} />
        </>
    );
};

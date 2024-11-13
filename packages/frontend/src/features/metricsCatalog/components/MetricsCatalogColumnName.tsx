import { isEmojiIcon, type CatalogField } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    getDefaultZIndex,
    Group,
    Highlight,
    Paper,
    Portal,
} from '@mantine/core';
import { useClickOutside } from '@mantine/hooks';
import { IconTrash } from '@tabler/icons-react';
import EmojiPicker, {
    Emoji,
    EmojiStyle,
    type EmojiClickData,
} from 'emoji-picker-react';
import { type MRT_Row, type MRT_TableInstance } from 'mantine-react-table';
import { forwardRef, useCallback, useEffect, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTracking } from '../../../providers/TrackingProvider';
import { MetricIconPlaceholder } from '../../../svgs/metricsCatalog';
import { EventName } from '../../../types/Events';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useUpdateCatalogItemIcon } from '../hooks/useCatalogCategories';

const PICKER_HEIGHT = 400;

const SharedEmojiPicker = forwardRef(
    (
        {
            emoji,
            position,
            onClick,
        }: {
            emoji: CatalogField['icon'];
            position: { top: number; left: number } | null;
            onClick: (emoji: EmojiClickData | null) => void;
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
                    <Paper shadow="xs" withBorder pt="xs" px="xs">
                        {emoji && (
                            <Group position="right">
                                <Button
                                    variant="light"
                                    size="xs"
                                    compact
                                    color="gray"
                                    onClick={() => onClick(null)}
                                    leftIcon={<MantineIcon icon={IconTrash} />}
                                >
                                    Remove
                                </Button>
                            </Group>
                        )}
                        {/* TODO: display loader on emoji picker loading */}
                        <EmojiPicker
                            height={PICKER_HEIGHT}
                            onEmojiClick={onClick}
                            previewConfig={undefined}
                            lazyLoadEmojis
                            emojiStyle={EmojiStyle.NATIVE}
                            searchDisabled
                            style={{
                                border: 'none',
                            }}
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

export const MetricsCatalogColumnName = forwardRef<HTMLDivElement, Props>(
    ({ row, table }, ref) => {
        const { track } = useTracking();
        const organizationUuid = useAppSelector(
            (state) => state.metricsCatalog.organizationUuid,
        );
        const projectUuid = useAppSelector(
            (state) => state.metricsCatalog.projectUuid,
        );

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

        const handleOnClick = (emoji: EmojiClickData | null) => {
            if (!projectUuid) return;

            let icon: CatalogField['icon'] = null;
            if (emoji) {
                icon = emoji.isCustom
                    ? {
                          url: emoji.imageUrl,
                      }
                    : {
                          unicode: emoji.unified,
                      };
            }
            updateCatalogItemIcon({
                projectUuid,
                catalogSearchUuid: row.original.catalogSearchUuid,
                icon,
            });

            if (emoji) {
                track({
                    name: EventName.METRICS_CATALOG_ICON_APPLIED,
                    properties: {
                        organizationId: organizationUuid,
                        projectId: projectUuid,
                    },
                });
            }
            handleClosePicker();
        };

        return (
            <Box ref={ref}>
                <Group noWrap spacing="xs">
                    <ActionIcon
                        ref={setIconRef}
                        variant="default"
                        onClick={handleIconClick}
                        sx={(theme) => ({
                            width: 28,
                            height: 28,
                            flexShrink: 0,
                            borderRadius: '8px',
                            border: `1px solid ${theme.colors.gray[3]}`,
                            ...(!isEmojiIcon(row.original.icon) && {
                                boxShadow:
                                    '0px -2px 0px 0px rgba(10, 13, 18, 0.07) inset, 0px 1px 2px 0px rgba(16, 24, 40, 0.05)',
                            }),
                        })}
                    >
                        {isEmojiIcon(row.original.icon) ? (
                            <Emoji
                                size={18}
                                unified={row.original.icon.unicode}
                            />
                        ) : (
                            <MetricIconPlaceholder width={12} height={12} />
                        )}
                    </ActionIcon>
                    <Highlight highlight={table.getState().globalFilter || ''}>
                        {row.original.label}
                    </Highlight>
                </Group>
                <SharedEmojiPicker
                    emoji={row.original.icon}
                    position={pickerPosition}
                    ref={setPickerRef}
                    onClick={handleOnClick}
                />
            </Box>
        );
    },
);

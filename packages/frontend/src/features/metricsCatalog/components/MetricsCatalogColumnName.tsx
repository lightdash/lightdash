import {
    interpolateUiString,
    isEmojiIcon,
    type CatalogField,
} from '@lightdash/common';
import {
    Box,
    Group,
    Button,
    ActionIcon,
    Highlight,
    Popover,
    CloseButton,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import EmojiPicker, {
    Emoji,
    EmojiStyle,
    type EmojiClickData,
} from 'emoji-picker-react';
import { forwardRef, useState } from 'react';
import {
    type ContentTableRow,
    type ContentTableInstance,
} from '../../../components/common/ContentTable';
import MantineIcon from '../../../components/common/MantineIcon';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import useTracking from '../../../providers/Tracking/useTracking';
import { MetricIconPlaceholder } from '../../../svgs/metricsCatalog';
import { EventName } from '../../../types/Events';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useUpdateCatalogItemIcon } from '../hooks/useCatalogItemIcon';
import { MetricDetailPopover } from './MetricDetailPopover';
import styles from './MetricsCatalogColumnName.module.css';
import '../../../styles/emoji-picker-react.css';

type Props = {
    row: ContentTableRow<CatalogField>;
    table: ContentTableInstance<CatalogField>;
};

export const MetricsCatalogColumnName = forwardRef<HTMLDivElement, Props>(
    ({ row, table }, ref) => {
        const { track } = useTracking();
        const userUuid = useAppSelector(
            (state) => state.metricsCatalog.user?.userUuid,
        );
        const organizationUuid = useAppSelector(
            (state) => state.metricsCatalog.organizationUuid,
        );
        const projectUuid = useAppSelector(
            (state) => state.metricsCatalog.projectUuid,
        );
        const canManageTags = useAppSelector(
            (state) => state.metricsCatalog.abilities.canManageTags,
        );

        const [isPickerOpen, setIsPickerOpen] = useState(false);
        const getUiString = useUiStrings();
        const { mutate: updateCatalogItemIcon } = useUpdateCatalogItemIcon();

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
                        userId: userUuid,
                        organizationId: organizationUuid,
                        projectId: projectUuid,
                    },
                });
            }
            setIsPickerOpen(false);
        };

        return (
            <Box ref={ref}>
                <Group wrap="nowrap" gap="xs">
                    <Popover
                        opened={isPickerOpen}
                        onChange={setIsPickerOpen}
                        width="min(366px, calc(100vw - 24px))"
                        floatingStrategy="fixed"
                        middlewares={{
                            shift: { crossAxis: true, padding: 12 },
                        }}
                        trapFocus
                    >
                        <Popover.Target>
                            <ActionIcon
                                variant="default"
                                size={28}
                                disabled={!canManageTags}
                                aria-label={interpolateUiString(
                                    getUiString('metrics.changeIcon'),
                                    { metric: row.original.label },
                                )}
                                aria-expanded={isPickerOpen}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setIsPickerOpen((value) => !value);
                                }}
                                className={styles.iconButton}
                                data-placeholder={
                                    !isEmojiIcon(row.original.icon) || undefined
                                }
                            >
                                {isEmojiIcon(row.original.icon) ? (
                                    <Emoji
                                        size={16}
                                        unified={row.original.icon.unicode}
                                    />
                                ) : (
                                    <MetricIconPlaceholder
                                        width={12}
                                        height={12}
                                    />
                                )}
                            </ActionIcon>
                        </Popover.Target>
                        <Popover.Dropdown
                            p="xs"
                            className={styles.iconDropdown}
                        >
                            <Group
                                justify="space-between"
                                mb="xs"
                                className={styles.iconHeader}
                            >
                                {row.original.icon ? (
                                    <Button
                                        variant="light"
                                        size="xs"
                                        color="gray"
                                        onClick={() => handleOnClick(null)}
                                        leftSection={
                                            <MantineIcon icon={IconTrash} />
                                        }
                                    >
                                        {getUiString('metrics.removeIcon')}
                                    </Button>
                                ) : (
                                    <span />
                                )}
                                <CloseButton
                                    size={44}
                                    aria-label={getUiString(
                                        'metrics.closeIconPicker',
                                    )}
                                    onClick={() => setIsPickerOpen(false)}
                                />
                            </Group>
                            {isPickerOpen && (
                                <EmojiPicker
                                    height={300}
                                    width="100%"
                                    onEmojiClick={handleOnClick}
                                    previewConfig={{ showPreview: false }}
                                    lazyLoadEmojis
                                    emojiStyle={EmojiStyle.NATIVE}
                                />
                            )}
                        </Popover.Dropdown>
                    </Popover>
                    {projectUuid && (
                        <MetricDetailPopover
                            tableName={row.original.tableName}
                            metricName={row.original.name}
                            metricLabel={row.original.label}
                            projectUuid={projectUuid}
                            showExploreButton={false}
                        >
                            <Highlight
                                highlight={table.getState().globalFilter || ''}
                                fw={500}
                                fz="sm"
                                lh="150%"
                            >
                                {row.original.label}
                            </Highlight>
                        </MetricDetailPopover>
                    )}
                </Group>
            </Box>
        );
    },
);

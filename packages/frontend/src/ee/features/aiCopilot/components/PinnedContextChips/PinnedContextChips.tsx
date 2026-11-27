import { type AiPromptContextItem } from '@lightdash/common';
import { ActionIcon, Box, Popover, Text, UnstyledButton } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ContentReferenceIcon } from '../ChatElements/ContentReferenceLink';
import { getPromptContextItemKey } from '../ChatElements/contentReferenceUtils';
import {
    getPinnableContextMeta,
    isPinnableContextItem,
    type PinnableContextItem,
} from './pinnableContext';
import styles from './PinnedContextChips.module.css';

const MAX_VISIBLE_CHIPS = 3;

const ContextIcon: FC<{ item: PinnableContextItem; size: number }> = ({
    item,
    size,
}) => (
    <ContentReferenceIcon
        kind={item.type}
        chartKind={getPinnableContextMeta(item).chartKind ?? undefined}
        size={size}
    />
);

const RemoveButton: FC<{ label: string; onRemove: () => void }> = ({
    label,
    onRemove,
}) => (
    <ActionIcon
        size="xs"
        c="dimmed"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
    >
        <MantineIcon icon={IconX} size={12} />
    </ActionIcon>
);

type Props = {
    items: AiPromptContextItem[];
    onRemove: (item: PinnableContextItem) => void;
};

/**
 * Content pinned to the next prompt, shown inside the composer. The first few
 * are chips; the rest sit behind a count that opens the full list.
 */
export const PinnedContextChips: FC<Props> = ({ items, onRemove }) => {
    const [isListOpen, setIsListOpen] = useState(false);
    const pinnable = items.filter(isPinnableContextItem);
    if (pinnable.length === 0) return null;

    const visible = pinnable.slice(0, MAX_VISIBLE_CHIPS);
    const hidden = pinnable.slice(MAX_VISIBLE_CHIPS);

    return (
        <Box className={styles.chips}>
            {visible.map((item) => {
                const { label } = getPinnableContextMeta(item);
                return (
                    <Box
                        key={getPromptContextItemKey(item)}
                        className={styles.chip}
                        title={label}
                    >
                        <ContextIcon item={item} size={14} />
                        <span className={styles.label}>{label}</span>
                        <RemoveButton
                            label={label}
                            onRemove={() => onRemove(item)}
                        />
                    </Box>
                );
            })}
            {hidden.length > 0 && (
                <Popover
                    opened={isListOpen}
                    onChange={setIsListOpen}
                    position="top-start"
                    width={240}
                >
                    <Popover.Target>
                        <UnstyledButton
                            className={styles.more}
                            aria-expanded={isListOpen}
                            onClick={() => setIsListOpen((opened) => !opened)}
                        >
                            +{hidden.length} more
                        </UnstyledButton>
                    </Popover.Target>
                    <Popover.Dropdown p={4}>
                        <Box className={styles.list}>
                            {hidden.map((item) => {
                                const { label } = getPinnableContextMeta(item);
                                return (
                                    <Box
                                        key={getPromptContextItemKey(item)}
                                        className={styles.row}
                                        title={label}
                                    >
                                        <ContextIcon item={item} size={14} />
                                        <Text
                                            size="xs"
                                            fw={500}
                                            truncate
                                            className={styles.rowText}
                                        >
                                            {label}
                                        </Text>
                                        <RemoveButton
                                            label={label}
                                            onRemove={() => onRemove(item)}
                                        />
                                    </Box>
                                );
                            })}
                        </Box>
                    </Popover.Dropdown>
                </Popover>
            )}
        </Box>
    );
};

import { type DashboardHeadingTile as DashboardHeadingTileType } from '@lightdash/common';
import { ActionIcon, Box, Menu, Text, Textarea, Tooltip } from '@mantine/core';
import { IconCopy, IconUnderline } from '@tabler/icons-react';
import { clsx } from 'clsx';
import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FC,
    type FocusEvent,
    type KeyboardEvent,
} from 'react';
import { v4 as uuid4 } from 'uuid';
import {
    dashboardEditActions,
    selectIsTileTextFocusPending,
    useDashboardDispatch,
    useDashboardSelector,
} from '../../features/dashboard/store';
import { appendNewTilesToBottom } from '../../hooks/dashboard/useDashboard';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import MantineIcon from '../common/MantineIcon';
import styles from './DashboardHeadingTile.module.css';
import TileBase from './TileBase/index';

export type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & {
    tile: DashboardHeadingTileType;
};

const keepFocus = (event: React.MouseEvent) => event.preventDefault();

const DashboardHeadingTile: FC<Props> = (props) => {
    const { tile, isEditMode, onEdit } = props;
    const { text, showDivider = false } = tile.properties;

    const dispatch = useDashboardDispatch();
    const inputRef = useRef<HTMLTextAreaElement>(null);
    // Null while the heading is not being edited
    const [draft, setDraft] = useState<string | null>(null);
    const [isToolbarOpen, setIsToolbarOpen] = useState(false);
    const isCancelled = useRef(false);

    const handleFocus = useCallback(() => {
        isCancelled.current = false;
        setDraft(text);
        setIsToolbarOpen(true);
    }, [text]);

    const handleBlur = useCallback(() => {
        const next = draft?.trim() ?? '';
        if (!isCancelled.current && next.length > 0 && next !== text) {
            onEdit({ ...tile, properties: { ...tile.properties, text: next } });
        }
        setDraft(null);
    }, [draft, text, tile, onEdit]);

    const isTextFocusPending = useDashboardSelector((state) =>
        selectIsTileTextFocusPending(state, tile.uuid),
    );
    useEffect(() => {
        if (!isTextFocusPending) return;
        inputRef.current?.focus();
        inputRef.current?.select();
        dispatch(dashboardEditActions.focusTileText(null));
    }, [isTextFocusPending, dispatch]);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
                isCancelled.current = true;
                event.currentTarget.blur();
            }
        },
        [],
    );

    const handleFocusLeave = useCallback(
        (event: FocusEvent<HTMLDivElement>) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
                setIsToolbarOpen(false);
            }
        },
        [],
    );

    const toggleDivider = useCallback(
        () =>
            onEdit({
                ...tile,
                properties: { ...tile.properties, showDivider: !showDivider },
            }),
        [tile, showDivider, onEdit],
    );

    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const setHaveTilesChanged = useDashboardContext(
        (c) => c.setHaveTilesChanged,
    );
    const duplicate = useCallback(() => {
        setDashboardTiles((currentTiles) =>
            appendNewTilesToBottom(currentTiles, [{ ...tile, uuid: uuid4() }]),
        );
        setHaveTilesChanged(true);
    }, [tile, setDashboardTiles, setHaveTilesChanged]);

    if (!isEditMode) {
        return (
            <TileBase title="" transparent {...props}>
                <Text
                    size="24px"
                    fw="bold"
                    className={clsx(
                        styles.heading,
                        showDivider && styles.withDivider,
                    )}
                >
                    {text}
                </Text>
            </TileBase>
        );
    }

    return (
        <Box h="100%" onBlur={handleFocusLeave}>
            <TileBase
                title=""
                transparent
                {...props}
                extraMenuItems={
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconCopy} />}
                        onClick={duplicate}
                    >
                        Duplicate
                    </Menu.Item>
                }
                focusedActions={
                    isToolbarOpen && (
                        <Tooltip label="Underline">
                            <ActionIcon
                                size="sm"
                                variant={showDivider ? 'light' : undefined}
                                aria-label="Underline"
                                aria-pressed={showDivider}
                                onMouseDown={keepFocus}
                                onClick={toggleDivider}
                            >
                                <MantineIcon icon={IconUnderline} />
                            </ActionIcon>
                        </Tooltip>
                    )
                }
            >
                <Textarea
                    ref={inputRef}
                    variant="unstyled"
                    autosize
                    minRows={1}
                    aria-label="Heading text"
                    placeholder="Heading"
                    value={draft ?? text}
                    onChange={(event) => setDraft(event.currentTarget.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    className={clsx(
                        styles.heading,
                        showDivider && styles.withDivider,
                    )}
                    classNames={{ input: styles.input }}
                />
            </TileBase>
        </Box>
    );
};

export default DashboardHeadingTile;

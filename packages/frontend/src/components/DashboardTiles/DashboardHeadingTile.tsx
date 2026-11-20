import {
    DashboardHeadingSize,
    DashboardHeadingTextAlign,
    DashboardHeadingVerticalAlign,
    DEFAULT_DASHBOARD_HEADING_SIZE,
    DEFAULT_DASHBOARD_HEADING_TEXT_ALIGN,
    DEFAULT_DASHBOARD_HEADING_VERTICAL_ALIGN,
    type DashboardHeadingTile as DashboardHeadingTileType,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Divider,
    Menu,
    Text,
    Textarea,
    Tooltip,
} from '@mantine/core';
import {
    IconAlignCenter,
    IconAlignLeft,
    IconAlignRight,
    IconCopy,
    IconH1,
    IconH2,
    IconH3,
    IconH4,
    IconLayoutAlignBottom,
    IconLayoutAlignMiddle,
    IconLayoutAlignTop,
    IconUnderline,
    type Icon,
} from '@tabler/icons-react';
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

type FormatOption<V extends string> = { value: V; label: string; icon: Icon };

const SIZE_OPTIONS: FormatOption<DashboardHeadingSize>[] = [
    { value: DashboardHeadingSize.LG, label: 'Large', icon: IconH1 },
    { value: DashboardHeadingSize.MD, label: 'Medium', icon: IconH2 },
    { value: DashboardHeadingSize.SM, label: 'Small', icon: IconH3 },
    { value: DashboardHeadingSize.XS, label: 'Extra small', icon: IconH4 },
];

const TEXT_ALIGN_OPTIONS: FormatOption<DashboardHeadingTextAlign>[] = [
    {
        value: DashboardHeadingTextAlign.LEFT,
        label: 'Align left',
        icon: IconAlignLeft,
    },
    {
        value: DashboardHeadingTextAlign.CENTER,
        label: 'Align center',
        icon: IconAlignCenter,
    },
    {
        value: DashboardHeadingTextAlign.RIGHT,
        label: 'Align right',
        icon: IconAlignRight,
    },
];

const VERTICAL_ALIGN_OPTIONS: FormatOption<DashboardHeadingVerticalAlign>[] = [
    {
        value: DashboardHeadingVerticalAlign.TOP,
        label: 'Align top',
        icon: IconLayoutAlignTop,
    },
    {
        value: DashboardHeadingVerticalAlign.CENTER,
        label: 'Align middle',
        icon: IconLayoutAlignMiddle,
    },
    {
        value: DashboardHeadingVerticalAlign.BOTTOM,
        label: 'Align bottom',
        icon: IconLayoutAlignBottom,
    },
];

const keepFocus = (event: React.MouseEvent) => event.preventDefault();

type FormatButtonsProps<V extends string> = {
    options: FormatOption<V>[];
    value: V;
    onChange: (value: V) => void;
};

const FormatButtons = <V extends string>({
    options,
    value,
    onChange,
}: FormatButtonsProps<V>) =>
    options.map((option) => {
        const isActive = option.value === value;
        return (
            <Tooltip key={option.value} label={option.label}>
                <ActionIcon
                    size="sm"
                    variant={isActive ? 'light' : undefined}
                    aria-label={option.label}
                    aria-pressed={isActive}
                    onMouseDown={keepFocus}
                    // Picking what already shows must not store it on a
                    // heading that had no setting, or mark it as edited
                    onClick={() => !isActive && onChange(option.value)}
                >
                    <MantineIcon icon={option.icon} />
                </ActionIcon>
            </Tooltip>
        );
    });

const DashboardHeadingTile: FC<Props> = (props) => {
    const { tile, isEditMode, onEdit } = props;
    const {
        text,
        showDivider = false,
        size = DEFAULT_DASHBOARD_HEADING_SIZE,
        textAlign = DEFAULT_DASHBOARD_HEADING_TEXT_ALIGN,
        verticalAlign = DEFAULT_DASHBOARD_HEADING_VERTICAL_ALIGN,
    } = tile.properties;

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
        const startEditing = () => {
            inputRef.current?.focus();
            inputRef.current?.select();
        };
        startEditing();
        // Again once the menu that added the tile has closed and given focus back
        requestAnimationFrame(startEditing);
        dispatch(dashboardEditActions.focusTileText(null));
    }, [isTextFocusPending, dispatch]);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLTextAreaElement>) => {
            // Enter that confirms an IME composition is not the end of the edit
            if (event.nativeEvent.isComposing) return;
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

    const setFormat = useCallback(
        (format: Partial<DashboardHeadingTileType['properties']>) =>
            onEdit({ ...tile, properties: { ...tile.properties, ...format } }),
        [tile, onEdit],
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
                    data-size={size}
                    data-text-align={textAlign}
                    className={clsx(
                        styles.heading,
                        styles.text,
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
                        <>
                            <FormatButtons
                                options={SIZE_OPTIONS}
                                value={size}
                                onChange={(next) => setFormat({ size: next })}
                            />
                            <Divider orientation="vertical" />
                            <FormatButtons
                                options={TEXT_ALIGN_OPTIONS}
                                value={textAlign}
                                onChange={(next) =>
                                    setFormat({ textAlign: next })
                                }
                            />
                            <Divider orientation="vertical" />
                            <FormatButtons
                                options={VERTICAL_ALIGN_OPTIONS}
                                value={verticalAlign}
                                onChange={(next) =>
                                    setFormat({ verticalAlign: next })
                                }
                            />
                            <Divider orientation="vertical" />
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
                        </>
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
                    wrapperProps={{
                        'data-size': size,
                        'data-text-align': textAlign,
                    }}
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

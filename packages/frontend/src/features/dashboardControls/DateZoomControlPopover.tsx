import { type DateZoomControl } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Menu,
    Select,
    Stack,
    Text,
    Tooltip,
    type ComboboxData,
} from '@mantine/core';
import {
    IconCalendar,
    IconDots,
    IconEye,
    IconEyeOff,
    IconLayoutGrid,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import TruncatedText from '../../components/common/TruncatedText';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { DEFAULT_DATE_ZOOM_NAME } from './dateZoomControls';
import { formatTileCount, formatTilesOf } from './fieldLabels';
import classes from './FilterEditor.module.css';
import { EditorPrompt } from './FilterPopover';
import { MENU_TRANSITION } from './menuTransition';
import { useRefocusAfter } from './nameFocus';
import { NameInput } from './NameInput';

const NO_TILES_REASON = 'This date zoom is not applied to any tiles';

type Props = {
    control: DateZoomControl;
    /** The dashboard's enabled granularities, standard then custom. */
    granularityData: ComboboxData;
    /** Tiles it zooms: the N in "Zooms N of M tiles". */
    tileCount: number;
    /** Tiles any zoom can take: the M. */
    totalTileCount: number;
    /** A new zoom starts at its name. */
    isNew: boolean;
    /** Another pill was clicked over unapplied changes: "Apply changes to ... first?" */
    isAsking: boolean;
    onResolvePending: (shouldApply: boolean) => void;
    onChange: (next: DateZoomControl) => void;
    onCancel: () => void;
    onApply: () => void;
    onRemove: () => void;
    /** Null: the count alone, with no "Choose tiles". */
    onChooseTiles: (() => void) | null;
};

// The parameter popover's sentence for a named date zoom: its name, its
// grain, the tiles it zooms, and the same footer
export const DateZoomControlPopover: FC<Props> = ({
    control,
    granularityData,
    tileCount,
    totalTileCount,
    isNew,
    isAsking,
    onResolvePending,
    onChange,
    onCancel,
    onApply,
    onRemove,
    onChooseTiles,
}) => {
    const getUiString = useUiStrings();
    const [isRenaming, setIsRenaming] = useState(isNew);
    const { ref: pencilRef, exit } = useRefocusAfter(isRenaming);
    const name = control.name;
    const tilesOf = formatTilesOf(getUiString, tileCount, totalTileCount);
    const zooms = `Zooms ${
        tileCount === totalTileCount
            ? formatTileCount(getUiString, totalTileCount)
            : `${tilesOf.count} ${tilesOf.noun}`
    }`;
    const chooseTiles = getUiString('controls.chooseTiles');
    const applyBlockedReason = tileCount > 0 ? null : NO_TILES_REASON;

    return (
        <Box className={classes.root} role="dialog" aria-label={name}>
            {isAsking && (
                <EditorPrompt
                    name={name}
                    applyBlockedReason={applyBlockedReason}
                    onResolvePending={onResolvePending}
                />
            )}
            <Box
                className={classes.body}
                data-dimmed={isAsking || undefined}
                inert={isAsking || undefined}
            >
                <Group gap="xs" wrap="nowrap" className={classes.editorHeader}>
                    <MantineIcon icon={IconCalendar} size={16} color="dimmed" />
                    {isRenaming ? (
                        <NameInput
                            initial={name}
                            placeholder={DEFAULT_DATE_ZOOM_NAME}
                            onCommit={(text) =>
                                onChange({
                                    ...control,
                                    name:
                                        text.trim() === ''
                                            ? DEFAULT_DATE_ZOOM_NAME
                                            : text,
                                })
                            }
                            onDone={(how) => {
                                exit.current = how;
                                setIsRenaming(false);
                            }}
                        />
                    ) : (
                        <Box miw={0}>
                            <TruncatedText maxWidth="100%" fw={500}>
                                {name}
                            </TruncatedText>
                        </Box>
                    )}
                    {!isRenaming && (
                        <Group gap="xs" wrap="nowrap" ml="auto" flex="0 0 auto">
                            {control.hidden && (
                                <Text size="xs" c="dimmed">
                                    Hidden from viewers
                                </Text>
                            )}
                            <Tooltip fz="xs" label="Rename">
                                <ActionIcon
                                    size="sm"
                                    aria-label="Rename"
                                    ref={pencilRef}
                                    onClick={() => setIsRenaming(true)}
                                >
                                    <MantineIcon icon={IconPencil} size={14} />
                                </ActionIcon>
                            </Tooltip>
                            {/* Not portalled: a click in it is no press outside */}
                            <Menu
                                position="bottom-end"
                                withinPortal={false}
                                transitionProps={MENU_TRANSITION}
                            >
                                <Menu.Target>
                                    <ActionIcon
                                        size="sm"
                                        aria-label="Date zoom actions"
                                    >
                                        <MantineIcon
                                            icon={IconDots}
                                            size={14}
                                        />
                                    </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown className={classes.menu}>
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon
                                                icon={
                                                    control.hidden
                                                        ? IconEye
                                                        : IconEyeOff
                                                }
                                                size={14}
                                            />
                                        }
                                        onClick={() => {
                                            const { hidden: _hidden, ...rest } =
                                                control;
                                            onChange(
                                                control.hidden
                                                    ? rest
                                                    : { ...rest, hidden: true },
                                            );
                                        }}
                                    >
                                        {control.hidden
                                            ? 'Show for viewers'
                                            : 'Hide for viewers'}
                                    </Menu.Item>
                                    <Menu.Divider />
                                    <Menu.Item
                                        color="red"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconTrash}
                                                size={14}
                                            />
                                        }
                                        onClick={onRemove}
                                    >
                                        Remove date zoom
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </Group>
                    )}
                </Group>
                <Stack gap="xs" className={classes.content}>
                    <Select
                        size="xs"
                        aria-label="Granularity"
                        data={granularityData}
                        value={String(control.granularity)}
                        allowDeselect={false}
                        data-autofocus={isNew ? undefined : true}
                        onChange={(value) =>
                            value &&
                            onChange({ ...control, granularity: value })
                        }
                    />
                </Stack>
                <Group gap="xs" align="center" px="md" pb="sm">
                    {onChooseTiles === null ? (
                        <Group gap={6} wrap="nowrap" mih={24} px={6}>
                            <MantineIcon
                                icon={IconLayoutGrid}
                                size={14}
                                color="dimmed"
                            />
                            <Text span fz="xs" c="dimmed">
                                {zooms}
                            </Text>
                        </Group>
                    ) : (
                        <Button
                            variant="subtle"
                            color="gray"
                            size="compact-xs"
                            mih={24}
                            flex="0 0 auto"
                            aria-label={`${zooms}. ${chooseTiles}`}
                            leftSection={
                                <MantineIcon icon={IconLayoutGrid} size={14} />
                            }
                            onClick={onChooseTiles}
                        >
                            <Text span fz="xs">
                                <Text span fz="xs" c="dimmed">
                                    {zooms}
                                </Text>
                                {` · ${chooseTiles}`}
                            </Text>
                        </Button>
                    )}
                </Group>
                <Group
                    justify="flex-end"
                    wrap="nowrap"
                    className={classes.footer}
                >
                    <Group gap="xs" wrap="nowrap" flex="0 0 auto">
                        <Button variant="default" size="xs" onClick={onCancel}>
                            {getUiString('filters.actions.cancel')}
                        </Button>
                        <Tooltip
                            fz="xs"
                            label={applyBlockedReason}
                            disabled={applyBlockedReason === null}
                        >
                            <Box>
                                <Button
                                    size="xs"
                                    data-controls-apply
                                    disabled={applyBlockedReason !== null}
                                    onClick={onApply}
                                >
                                    {getUiString('filters.apply')}
                                </Button>
                            </Box>
                        </Tooltip>
                    </Group>
                </Group>
            </Box>
        </Box>
    );
};

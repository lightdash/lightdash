import { interpolateUiString } from '@lightdash/common';
import { Box, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useCallbackRef } from '@mantine/hooks';
import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import {
    memo,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { createPortal } from 'react-dom';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectActiveTab,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import { LazySelect } from './LazySelect';
import { focusOnMount } from './mappingFocus';
import {
    type ParameterTileCard,
    type TileParameterOption,
} from './parameterPeers';
import { getTilesOnTab } from './peers';
import { TileCardOffRow } from './TileOverlay';
import classes from './TileOverlay.module.css';
import {
    areTilePropsEqual,
    getTileTitle,
    type TileHighlight,
} from './tileProps';
import { getTileSelector, LOCKED_TILE_CLASS } from './tileSelector';
import { useParameterEditorSelector } from './useParameterEditor';
import { useParameterMapping } from './useParameterMapping';
import { usePortalTargets } from './usePortalTargets';
import { useScrollToHighlightedTile } from './useScrollToHighlightedTile';

const NO_KEYS: string[] = [];
// A tile card's select: the stand-in button, or the real input once used
const SELECT_SELECTOR = '[aria-haspopup="listbox"]';

// Primitives and lists of primitives only, so a card re-renders for its own tile
type Props = {
    tileUuid: string;
    controlName: string;
    selectLabel: string;
    cardKind: ParameterTileCard['kind'];
    /** The control setting the tile while this one does not, by its bar name. */
    takenByName: string | null;
    /** Every key the control sets on the tile; the picker shows the first. */
    setKeys: string[];
    optionKeys: string[];
    optionNames: string[];
    /** Per option, why it cannot be picked ("different values", set everywhere by another control); null: it can. */
    optionDisabledReason: (string | null)[];
    /** The question asked before a Move, its `{controls}` the names below. */
    moveTemplate: string;
    /** Per option, the controls a Move takes it from ("X and D"); null: nothing to take. */
    optionMoveFrom: (string | null)[];
    /** "Shows EMEA", while set and resolved. */
    valueLabel: string | null;
    highlight: TileHighlight | null;
    scrollKey: string | null;
    /** `isMove`: the author confirmed taking it from the control that sets it here. */
    onSet: (tileUuid: string, key: string | null, isMove: boolean) => void;
};

// A control named inside a sentence: the one part that reads at full weight
const ControlName: FC<{ name: string }> = ({ name }) => (
    <Text span inherit fw={600} c="text">
        {name}
    </Text>
);

const ParameterTileOverlay = memo<Props>(
    ({
        tileUuid,
        controlName,
        selectLabel,
        cardKind,
        takenByName,
        setKeys,
        optionKeys,
        optionNames,
        optionDisabledReason,
        moveTemplate,
        optionMoveFrom,
        valueLabel,
        highlight,
        scrollKey,
        onSet,
    }) => {
        const overlayRef = useRef<HTMLDivElement>(null);
        useScrollToHighlightedTile(overlayRef, scrollKey, scrollKey !== null);
        const setKey = setKeys[0] ?? null;
        // "Set this tile": the empty picker, nothing picked for the author
        const [isPicking, setIsPicking] = useState(false);
        // A parameter another control sets here, picked: asked before it moves
        const [pendingMove, setPendingMove] = useState<{
            key: string;
            from: string;
        } | null>(null);
        const isFocusPending = useRef(false);
        const isPickerShown = cardKind === 'set' || isPicking;
        // The picker takes focus once "Set this tile" or the question leaves
        useLayoutEffect(() => {
            if (
                !isFocusPending.current ||
                !isPickerShown ||
                pendingMove !== null
            )
                return;
            isFocusPending.current = false;
            overlayRef.current
                ?.querySelector<HTMLElement>(SELECT_SELECTOR)
                ?.focus();
        }, [isPickerShown, pendingMove]);

        // As a filter's unreachable tile: the veil only, the reason as its hint
        if (cardKind === 'none') {
            return (
                <div
                    className={`${classes.overlay} ${classes.unfilterable} ${LOCKED_TILE_CLASS}`}
                    data-controls-overlay
                    title={`No parameter ${controlName} can set`}
                />
            );
        }

        // Only the names: the Move question is where another control is named
        const options = optionKeys.map((key, index) => ({
            value: key,
            label:
                optionDisabledReason[index] === null
                    ? optionNames[index]
                    : `${optionNames[index]} (${optionDisabledReason[index]})`,
            disabled: optionDisabledReason[index] !== null,
        }));
        const pick = (key: string | null) => {
            // The empty picker cleared: back to "Not set"
            if (key === null && setKey === null) {
                setIsPicking(false);
                return;
            }
            const from =
                key === null ? null : optionMoveFrom[optionKeys.indexOf(key)];
            if (key !== null && from !== null && from !== undefined) {
                setPendingMove({ key, from });
                return;
            }
            setIsPicking(false);
            onSet(tileUuid, key, false);
        };
        const answer = (isMove: boolean) => {
            if (pendingMove === null) return;
            isFocusPending.current = true;
            setPendingMove(null);
            if (!isMove) return;
            setIsPicking(false);
            onSet(tileUuid, pendingMove.key, true);
        };

        return (
            <div
                ref={overlayRef}
                className={`${classes.overlay} ${LOCKED_TILE_CLASS}`}
                data-controls-overlay
                data-highlighted={highlight ?? undefined}
                // Editors only map parameters
                title="Tiles are locked while a parameter is edited"
            >
                <Box className={classes.ring} aria-hidden />
                <Paper
                    shadow="md"
                    p="sm"
                    radius="md"
                    className={classes.card}
                    title=""
                    data-controls-editor
                >
                    {pendingMove !== null ? (
                        // The question on its own line: a long control name has room
                        <Stack gap="xs">
                            <Text fz="xs" role="status">
                                {moveTemplate
                                    .split('{controls}')
                                    .flatMap((part, index) =>
                                        index === 0
                                            ? [part]
                                            : [
                                                  <ControlName
                                                      key={index}
                                                      name={pendingMove.from}
                                                  />,
                                                  part,
                                              ],
                                    )}
                            </Text>
                            <Group gap="xs" wrap="nowrap" justify="flex-end">
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    onClick={() => answer(false)}
                                >
                                    Cancel
                                </Button>
                                {/* The row's Apply is the one filled button */}
                                <Button
                                    variant="default"
                                    size="xs"
                                    ref={focusOnMount}
                                    onClick={() => answer(true)}
                                >
                                    Move
                                </Button>
                            </Group>
                        </Stack>
                    ) : isPickerShown ? (
                        <Stack gap="xs">
                            <Text fz="xs" c="dimmed" truncate>
                                {setKey === null
                                    ? 'Not set'
                                    : `Set by ${controlName} through`}
                            </Text>
                            <LazySelect
                                aria-label={selectLabel}
                                leftSection={
                                    <MantineIcon
                                        icon={IconAdjustmentsHorizontal}
                                        size={14}
                                        color="dimmed"
                                    />
                                }
                                placeholder="Select a parameter"
                                clearLabel={`Stop setting this tile by ${controlName}`}
                                options={{ kind: 'options', options }}
                                nothingFoundMessage="No parameters match"
                                value={setKey}
                                onChange={pick}
                                onReselect={
                                    setKeys.length > 1 ? pick : undefined
                                }
                            />
                            {setKey !== null && valueLabel !== null && (
                                <Text fz="xs" c="dimmed" truncate>
                                    {`Shows ${valueLabel}`}
                                </Text>
                            )}
                        </Stack>
                    ) : (
                        // As a filter's card for a tile it is not on
                        <TileCardOffRow
                            label={
                                takenByName === null ? (
                                    'Not set'
                                ) : (
                                    <>
                                        Set by{' '}
                                        <ControlName name={takenByName} />
                                    </>
                                )
                            }
                            actionLabel="Set this tile"
                            ariaLabel={selectLabel}
                            onAction={() => {
                                isFocusPending.current = true;
                                setIsPicking(true);
                            }}
                        />
                    )}
                </Paper>
            </div>
        );
    },
    areTilePropsEqual,
);

// Mounted only while a parameter control's tiles are chosen
export const ParameterTileOverlays: FC = () => {
    const isMapping = useParameterEditorSelector((c) => c.isMapping);
    return isMapping ? <MappedTileOverlays /> : null;
};

const MappedTileOverlays: FC = () => {
    const getUiString = useUiStrings();
    const mapping = useParameterMapping();
    const selectedKey = useParameterEditorSelector((c) => c.selectedKey);
    // As a filter's active field: the hovered chip, else the selected one
    const hoveredKey = useParameterEditorSelector((c) => c.hoveredKey);
    const activeKey = hoveredKey ?? selectedKey;
    const setTiles = useParameterEditorSelector((c) => c.setTiles);
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const activeTab = useDashboardSelector(selectActiveTab);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    // As the grid draws them: a tile with no tab, or a stale one, is on the first
    const tiles = useMemo(() => {
        const all = dashboardTiles ?? [];
        return activeTab && dashboardTabs.length > 0
            ? getTilesOnTab(all, dashboardTabs, activeTab.uuid)
            : all;
    }, [dashboardTiles, dashboardTabs, activeTab]);
    const tileUuids = useMemo(() => tiles.map((tile) => tile.uuid), [tiles]);
    const targets = usePortalTargets(
        tileUuids,
        getTileSelector,
        mapping !== null,
        true,
    );
    const handleSet = useCallbackRef(
        (tileUuid: string, key: string | null, isMove: boolean) =>
            setTiles([{ tileUuid, key, isMove }]),
    );
    if (mapping === null) return null;
    const disabledReasonOf = (option: TileParameterOption) =>
        option.isCompatible ? null : 'different values';

    return (
        <>
            {tiles.map((tile) => {
                const element = targets[tile.uuid];
                if (!element) return null;
                const card = mapping.cardByTile[tile.uuid];
                const options = mapping.optionsByTile[tile.uuid] ?? [];
                if (card === undefined) return null;
                const setKeys = card.kind === 'set' ? card.keys : NO_KEYS;
                const highlight: TileHighlight | null =
                    card.kind === 'none'
                        ? null
                        : card.kind === 'unset' || card.kind === 'taken'
                          ? 'available'
                          : activeKey === null
                            ? 'filtered'
                            : setKeys.includes(activeKey)
                              ? 'mapped'
                              : 'other';
                return createPortal(
                    <ParameterTileOverlay
                        tileUuid={tile.uuid}
                        controlName={mapping.name}
                        selectLabel={interpolateUiString(
                            getUiString('filters.tileCard.selectName'),
                            {
                                filter: mapping.name,
                                tile: getTileTitle(
                                    tile,
                                    getUiString('filters.tileCard.thisTile'),
                                ),
                            },
                        )}
                        cardKind={card.kind}
                        takenByName={
                            card.kind === 'taken'
                                ? mapping.controlNameOf(card.byId)
                                : null
                        }
                        setKeys={setKeys}
                        optionKeys={options.map(({ key }) => key)}
                        optionNames={options.map(({ name }) => name)}
                        optionDisabledReason={options.map(disabledReasonOf)}
                        moveTemplate={getUiString(
                            'controls.parameter.moveFrom',
                        )}
                        optionMoveFrom={options.map(({ setByIds }) =>
                            setByIds.length === 0
                                ? null
                                : setByIds
                                      .map(mapping.controlNameOf)
                                      .reduce((list, name) =>
                                          interpolateUiString(
                                              getUiString(
                                                  'controls.parameter.nameList',
                                              ),
                                              { list, name },
                                          ),
                                      ),
                        )}
                        valueLabel={mapping.valueByTile[tile.uuid] ?? null}
                        highlight={highlight}
                        // Only the clicked chip scrolls, never the hovered one
                        scrollKey={
                            selectedKey !== null &&
                            setKeys.includes(selectedKey)
                                ? selectedKey
                                : null
                        }
                        onSet={handleSet}
                    />,
                    element,
                    tile.uuid,
                );
            })}
        </>
    );
};

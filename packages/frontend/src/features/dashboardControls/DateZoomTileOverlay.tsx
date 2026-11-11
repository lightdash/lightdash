import { interpolateUiString } from '@lightdash/common';
import { Stack, Switch, Text } from '@mantine/core';
import { useCallbackRef } from '@mantine/hooks';
import { IconClock } from '@tabler/icons-react';
import { memo, useMemo, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { type DateZoomTileCard, type ZoomTileChange } from './dateZoomControls';
import { LazySelect } from './LazySelect';
import { ControlName, MoveQuestion, TileCard, TileVeil } from './TileCard';
import {
    areTilePropsEqual,
    getTileHighlight,
    type TileHighlight,
} from './tileProps';
import { useDateZoomEditorSelector } from './useDateZoomEditor';
import { useDateZoomMapping } from './useDateZoomMapping';
import { useTabTileTargets } from './useTabTileTargets';

const NO_STRINGS: string[] = [];

// Primitives and lists of primitives only, so a card re-renders for its own tile
type Props = {
    tileUuid: string;
    selectLabel: string;
    cardKind: DateZoomTileCard['kind'];
    fieldIds: string[];
    fieldLabels: string[];
    fieldTables: string[];
    /** Its field in this zoom; null: in it through the parameter; undefined: not in it. */
    fieldId: string | null | undefined;
    takenByName: string | null;
    /** Moving it would leave the other zoom with no tile. */
    isTakenLast: boolean;
    highlight: TileHighlight | null;
    onSet: (change: ZoomTileChange) => void;
};

const DateZoomTileOverlay = memo<Props>(
    ({
        tileUuid,
        selectLabel,
        cardKind,
        fieldIds,
        fieldLabels,
        fieldTables,
        fieldId,
        takenByName,
        isTakenLast,
        highlight,
        onSet,
    }) => {
        const getUiString = useUiStrings();
        // A pick on a tile another zoom has: asked before it moves
        const [pendingMove, setPendingMove] = useState<ZoomTileChange | null>(
            null,
        );

        if (cardKind === 'none') {
            return (
                <TileVeil
                    title={getUiString('controls.dateZoom.noDateField')}
                />
            );
        }

        const pick = (change: ZoomTileChange) => {
            if (change.target !== null && takenByName !== null)
                setPendingMove(change);
            else onSet(change);
        };
        const answer = (isMove: boolean) => {
            if (isMove && pendingMove !== null) onSet(pendingMove);
            setPendingMove(null);
        };
        const fieldTarget = (id: string | null): ZoomTileChange => {
            if (id === null) return { tileUuid, target: null };
            const index = fieldIds.indexOf(id);
            return {
                tileUuid,
                target: { fieldId: id, tableName: fieldTables[index] ?? null },
            };
        };
        const isInZoom = fieldId !== undefined;

        return (
            <TileCard
                highlight={highlight}
                title={getUiString('controls.dateZoom.tilesLocked')}
            >
                {pendingMove !== null && takenByName !== null ? (
                    <MoveQuestion
                        question={
                            <>
                                Move from <ControlName name={takenByName} />?
                                {isTakenLast &&
                                    ' It has no other tiles and will be removed.'}
                            </>
                        }
                        onAnswer={answer}
                    />
                ) : (
                    <Stack gap="xs">
                        {takenByName !== null && (
                            <Text fz="xs" c="dimmed" truncate>
                                {interpolateUiString(
                                    getUiString('controls.dateZoom.inZoom'),
                                    { zoom: takenByName },
                                )}
                            </Text>
                        )}
                        {cardKind === 'param' ? (
                            <Switch
                                size="xs"
                                label={getUiString(
                                    'controls.dateZoom.usesParameter',
                                )}
                                aria-label={selectLabel}
                                checked={isInZoom}
                                onChange={({ currentTarget }) =>
                                    pick({
                                        tileUuid,
                                        target: currentTarget.checked
                                            ? {
                                                  fieldId: null,
                                                  tableName: null,
                                              }
                                            : null,
                                    })
                                }
                            />
                        ) : (
                            <LazyFieldSelect
                                selectLabel={selectLabel}
                                fieldIds={fieldIds}
                                fieldLabels={fieldLabels}
                                value={fieldId ?? null}
                                onChange={(id) => pick(fieldTarget(id))}
                            />
                        )}
                    </Stack>
                )}
            </TileCard>
        );
    },
    areTilePropsEqual,
);

const LazyFieldSelect: FC<{
    selectLabel: string;
    fieldIds: string[];
    fieldLabels: string[];
    value: string | null;
    onChange: (fieldId: string | null) => void;
}> = ({ selectLabel, fieldIds, fieldLabels, value, onChange }) => {
    const getUiString = useUiStrings();
    const options = useMemo(
        () =>
            fieldIds.map((id, index) => ({
                value: id,
                label: fieldLabels[index] ?? id,
                disabled: false,
            })),
        [fieldIds, fieldLabels],
    );
    return (
        <LazySelect
            aria-label={selectLabel}
            leftSection={
                <MantineIcon icon={IconClock} size={14} color="dimmed" />
            }
            placeholder={getUiString('controls.dateZoom.dateField')}
            clearLabel={getUiString('controls.dateZoom.stopZooming')}
            options={{ kind: 'options', options }}
            nothingFoundMessage={getUiString('filters.tileCard.noFieldsMatch')}
            value={value}
            onChange={onChange}
        />
    );
};

// Mounted only while a date zoom's tiles are chosen
export const DateZoomTileOverlays: FC = () => {
    const isMapping = useDateZoomEditorSelector((c) => c.isMapping);
    return isMapping ? <MappedTileOverlays /> : null;
};

const MappedTileOverlays: FC = () => {
    const mapping = useDateZoomMapping();
    const setTiles = useDateZoomEditorSelector((c) => c.setTiles);
    const { tiles, targets, selectLabelOf } = useTabTileTargets(
        mapping !== null,
    );
    const handleSet = useCallbackRef((change: ZoomTileChange) =>
        setTiles([change], change.target === null ? 'clear' : 'pick'),
    );
    if (mapping === null) return null;

    return (
        <>
            {tiles.map((tile) => {
                const element = targets[tile.uuid];
                const card = mapping.cardByTile[tile.uuid];
                if (!element || card === undefined) return null;
                const isField = card.kind !== 'none';
                const fieldId = isField ? card.fieldId : undefined;
                return createPortal(
                    <DateZoomTileOverlay
                        tileUuid={tile.uuid}
                        selectLabel={selectLabelOf(mapping.name, tile)}
                        cardKind={card.kind}
                        fieldIds={isField ? card.fieldIds : NO_STRINGS}
                        fieldLabels={isField ? card.fieldLabels : NO_STRINGS}
                        fieldTables={isField ? card.fieldTables : NO_STRINGS}
                        fieldId={fieldId}
                        takenByName={
                            isField ? (card.takenBy?.name ?? null) : null
                        }
                        isTakenLast={isField && card.takenBy?.isLast === true}
                        highlight={getTileHighlight({
                            isReachable: isField,
                            isOnControl: fieldId !== undefined,
                            activeId: null,
                            isOnActive: () => false,
                        })}
                        onSet={handleSet}
                    />,
                    element,
                    tile.uuid,
                );
            })}
        </>
    );
};

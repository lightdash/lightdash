import {
    getDashboardTileParameterOverrides,
    resolveParameterDefault,
    type DashboardParameterControl,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectDashboardParameterDefinitions,
    selectDashboardTiles,
    selectParameterControls,
    selectParameterPicks,
    selectParameterControlPicks,
    selectTileParameterReferences,
    useDashboardSelector,
} from '../dashboard/store';
import {
    getParameterControlInputs,
    getTileDashboardParameterInputs,
} from '../dashboard/store/parameterControls';
import { getParameterDisplayValue } from '../parameters/utils/parameterDisplayValue';
import {
    getParameterControlBaseName,
    getParameterModelLabel,
    getParameterNameSuffixes,
} from './parameterControlsBar';
import { getParameterName, getParameterOptions } from './parameterOptions';
import {
    getParameterTileCard,
    getTileParameterOptions,
    type ParameterMapping,
} from './parameterPeers';
import { useParameterEditorSelector } from './useParameterEditor';

export { type ParameterMapping } from './parameterPeers';

const NO_RECORD: Record<string, never> = {};

/** Everything mapping a parameter control shows, computed once by the editor; null while not mapping. */
export const useParameterMapping = (): ParameterMapping | null =>
    useParameterEditorSelector((c) => c.mapping);

// The editor's one computation of the mapping model, from its edit state
export const useParameterMappingModel = ({
    isMapping,
    draft,
    draftControls,
    openedKeys,
}: {
    isMapping: boolean;
    draft: DashboardParameterControl | null;
    /** Every control as mapping leaves them, the draft among them. */
    draftControls: DashboardParameterControl[] | null;
    /** The keys it had as it opened: their chips stay while it holds none. */
    openedKeys: string[];
}): ParameterMapping | null => {
    const saved = useDashboardSelector((state) =>
        isMapping ? selectParameterControls(state) : null,
    );
    // Nothing is read while not mapping: tile runs would re-render the editor
    const definitions = useDashboardSelector((state) =>
        isMapping ? selectDashboardParameterDefinitions(state) : NO_RECORD,
    );
    const references = useDashboardSelector((state) =>
        isMapping ? selectTileParameterReferences(state) : NO_RECORD,
    );
    const picks = useDashboardSelector((state) =>
        isMapping ? selectParameterPicks(state) : NO_RECORD,
    );
    const controlPicks = useDashboardSelector((state) =>
        isMapping ? selectParameterControlPicks(state) : NO_RECORD,
    );
    const tilePicks = useDashboardSelector((state) =>
        isMapping ? state.parameters.parameterTilePicks : NO_RECORD,
    );
    const chartSavedValues = useDashboardSelector((state) =>
        isMapping ? state.parameters.tileChartSavedParameters : NO_RECORD,
    );
    const tiles = useDashboardSelector((state) =>
        isMapping ? selectDashboardTiles(state) : undefined,
    );
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const getUiString = useUiStrings();

    return useMemo(() => {
        if (!isMapping || draft === null || draftControls === null) return null;
        // Loaded definitions are the user's: a reserved name counts only as one
        const userParameterNames = Object.keys(definitions);
        // The draft's value and name over its tiles and keys as mapping leaves them
        const mapped = draftControls.find(({ id }) => id === draft.id);
        const control: DashboardParameterControl =
            mapped === undefined
                ? draft
                : { ...draft, parameters: mapped.parameters };
        // Every control as mapping leaves them, a control added to the bar since included
        const list = [
            ...draftControls.map((item) =>
                item.id === control.id ? control : item,
            ),
            ...(saved ?? []).filter(
                (item) => !draftControls.some(({ id }) => id === item.id),
            ),
        ];
        const firstOf = (item: DashboardParameterControl) => {
            const [key] = Object.keys(item.parameters);
            const definition = key === undefined ? undefined : definitions[key];
            return definition === undefined ? undefined : { key, definition };
        };
        const controlKeys = [
            ...new Set([...openedKeys, ...Object.keys(control.parameters)]),
        ];
        // What the others must match: its first key, bound or as it opened
        const base =
            controlKeys.map((key) => definitions[key]).find(Boolean) ?? null;
        const parameterOptions = getParameterOptions({
            definitions,
            tileParameterReferences: references,
            fields: allFilterableFields ?? [],
        });
        const names = new Map(
            parameterOptions.map((option) => [
                option.key,
                getParameterName(option),
            ]),
        );
        const nameOf = (key: string) => names.get(key) ?? key;
        // As the bar names pills: the model only where it tells names apart
        const tableLabels = new Map(
            (allFilterableFields ?? []).map(({ table, tableLabel }) => [
                table,
                tableLabel,
            ]),
        );
        const unnamed = getUiString('controls.parameter.unnamed');
        const baseNameOf = (control: DashboardParameterControl) =>
            getParameterControlBaseName(control, firstOf(control), unnamed);
        const suffixes = getParameterNameSuffixes(
            list.map((control) => ({
                id: control.id,
                baseName: baseNameOf(control),
                key: firstOf(control)?.key ?? '',
            })),
            (key) =>
                getParameterModelLabel(
                    key,
                    tableLabels,
                    getUiString('controls.parameter.project'),
                ),
        );
        const nameOfControl = (control: DashboardParameterControl) => {
            const suffix = suffixes.get(control.id) ?? null;
            return suffix === null
                ? baseNameOf(control)
                : `${baseNameOf(control)} · ${suffix}`;
        };
        const inputs = getParameterControlInputs(
            list,
            picks,
            userParameterNames,
            controlPicks,
            tilePicks,
        );
        const tileUuids = (tiles ?? []).map(({ uuid }) => uuid);
        const optionsByTile = Object.fromEntries(
            tileUuids.map((tileUuid) => [
                tileUuid,
                getTileParameterOptions({
                    keys: references[tileUuid] ?? [],
                    definitions,
                    control,
                    controls: list,
                    tileUuid,
                    base,
                    nameOf,
                    userParameterNames,
                }),
            ]),
        );
        const cardByTile = Object.fromEntries(
            tileUuids.map((tileUuid) => [
                tileUuid,
                getParameterTileCard({
                    control,
                    controls: list,
                    tileUuid,
                    options: optionsByTile[tileUuid],
                    userParameterNames,
                }),
            ]),
        );
        const valueByTile = Object.fromEntries(
            tileUuids.map((tileUuid) => {
                const card = cardByTile[tileUuid];
                if (card.kind !== 'set') return [tileUuid, null];
                // The value of the key the picker shows
                const [key] = card.keys;
                const definition = definitions[key];
                const value =
                    getDashboardTileParameterOverrides({
                        ...getTileDashboardParameterInputs({
                            controlInputs: inputs,
                            tileUuid,
                            tileParameterReferences: references,
                            dashboardValues: {},
                        }),
                        chartSavedValues: chartSavedValues[tileUuid] ?? {},
                        definitions,
                    })[key] ?? resolveParameterDefault(definition);
                return [
                    tileUuid,
                    value === undefined || definition === undefined
                        ? null
                        : getParameterDisplayValue(definition, value),
                ];
            }),
        );
        return {
            control,
            name: nameOfControl(control),
            controlKeys,
            controls: list,
            tileParameterReferences: references,
            userParameterNames,
            nameOf,
            controlNameOf: (id) => {
                const item = list.find((other) => other.id === id);
                return item ? nameOfControl(item) : id;
            },
            optionsByTile,
            cardByTile,
            valueByTile,
            takeableTileUuids: tileUuids.filter(
                (tileUuid) => cardByTile[tileUuid].kind !== 'none',
            ),
            appliedTileUuids: tileUuids.filter(
                (tileUuid) => cardByTile[tileUuid].kind === 'set',
            ),
        };
    }, [
        isMapping,
        draft,
        draftControls,
        openedKeys,
        saved,
        definitions,
        references,
        picks,
        controlPicks,
        tilePicks,
        chartSavedValues,
        tiles,
        allFilterableFields,
        getUiString,
    ]);
};

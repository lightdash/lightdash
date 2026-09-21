import {
    assertUnreachable,
    getItemId,
    getItemLabelWithoutTableName,
    type ChartTypeDataInputSuggestion,
    type DataAppVizFieldMapping,
    type ItemsMap,
    type SuggestedChartTypeData,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Button,
    Group,
    Loader,
    Table,
    Text,
} from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import FieldSelect from '../../../components/common/FieldSelect';
import MantineIcon from '../../../components/common/MantineIcon';
import DataAppVizFieldTypeBadge from '../components/DataAppVizFieldTypeBadge';
import {
    dataAppVizFieldPools,
    poolKeyForSlot,
} from '../utils/autoMapDataAppVizFields';
import { getDataAppVizFieldItems } from '../utils/getDataAppVizFieldItems';
import { type PreviewFitState } from './previewDataTypes';
import classes from './SuggestedDataSheet.module.css';

type Props = {
    /** Null while a request is in flight. */
    data: SuggestedChartTypeData | null;
    /** The binding as it would be queried, from the preview's selection. */
    fieldMapping: DataAppVizFieldMapping;
    /** The chosen explore's columns, for the per-input selects. */
    itemsMap: ItemsMap;
    fit: PreviewFitState;
    /** The run started by "Run once and build" has not come back. */
    isRunning: boolean;
    /** Why the last run failed; null when none has. */
    runError: string | null;
    onSetField: (fieldName: string, fieldId: string | string[] | null) => void;
    onChooseAlternative: (exploreName: string) => void;
    onUseSampleData: () => void;
    /** Hands the composer back, so the author can say what they meant. */
    onSomethingElse: () => void;
    onRunOnceAndBuild: () => void;
};

const inputCount = (count: number) =>
    `${count} input${count === 1 ? '' : 's'} to fix`;

/** What the header badge says about the binding on screen. Nothing is claimed
 *  about the fit until the explore behind it has been read. */
const fitBadge = (
    fit: PreviewFitState,
    suggestedFits: boolean,
): { label: string; color: string } => {
    switch (fit.status) {
        case 'fits':
            return { label: 'Shape fits', color: 'green' };
        case 'doesNotFit':
            return { label: inputCount(fit.issues.length), color: 'ldGray' };
        case 'unavailable':
            return { label: 'Data unavailable', color: 'red' };
        case 'resolving':
            return { label: 'Checking fit…', color: 'ldGray' };
        case 'notApplicable':
            return suggestedFits
                ? { label: 'Shape fits', color: 'green' }
                : { label: 'Inputs to fix', color: 'ldGray' };
        default:
            return assertUnreachable(fit, 'Unknown preview fit state');
    }
};

const canRun = (fit: PreviewFitState, suggestedFits: boolean): boolean => {
    switch (fit.status) {
        case 'fits':
            return true;
        case 'doesNotFit':
        case 'unavailable':
        case 'resolving':
            return false;
        case 'notApplicable':
            return suggestedFits;
        default:
            return assertUnreachable(fit, 'Unknown preview fit state');
    }
};

const InputRow: FC<{
    input: ChartTypeDataInputSuggestion;
    fieldMapping: DataAppVizFieldMapping;
    itemsMap: ItemsMap;
    /** The explore's columns have been read, so what is bound can be named. */
    isExploreResolved: boolean;
    onSetField: Props['onSetField'];
}> = ({ input, fieldMapping, itemsMap, isExploreResolved, onSetField }) => {
    const [isChanging, setIsChanging] = useState(false);
    const slot = {
        name: input.name,
        label: input.label,
        type: input.type,
        required: input.required,
    };
    const { dimensions, metrics } = useMemo(
        () => getDataAppVizFieldItems(itemsMap),
        [itemsMap],
    );
    const pools = useMemo(() => dataAppVizFieldPools(itemsMap), [itemsMap]);
    const items = {
        dimension: dimensions,
        metric: metrics,
        column: [...metrics, ...dimensions],
    }[poolKeyForSlot(slot)];

    const bound = fieldMapping[input.name];
    const boundId = Array.isArray(bound) ? bound[0] : bound;
    const boundItem = boundId === undefined ? undefined : itemsMap[boundId];
    const boundKind =
        boundId !== undefined && pools.dimension.includes(boundId)
            ? 'dimension'
            : boundId !== undefined && pools.metric.includes(boundId)
              ? 'metric'
              : null;
    // Until the explore is read there is nothing to name a column with, so the
    // suggestion's own words stand in rather than a raw id or a false "No match".
    const shown: { label: string; kind: 'dimension' | 'metric' } | null =
        boundItem && boundKind
            ? {
                  label: getItemLabelWithoutTableName(boundItem),
                  kind: boundKind,
              }
            : !isExploreResolved && input.fieldId !== null && input.fieldType
              ? {
                    label: input.fieldLabel ?? input.fieldId,
                    kind: input.fieldType,
                }
              : null;
    // The reason belongs to the field the suggestion picked; say so plainly
    // when something else is bound instead.
    const why =
        shown === null || boundId === input.fieldId
            ? input.reason
            : input.fieldId === null
              ? 'Filled from this explore'
              : 'Chosen by you';

    return (
        <Table.Tr>
            <Table.Td>
                <Text fz="xs" fw={500}>
                    {input.label}
                </Text>
            </Table.Td>
            <Table.Td className={classes.fieldCell}>
                {isChanging ? (
                    <FieldSelect
                        size="xs"
                        aria-label={`Field for ${input.label}`}
                        placeholder={`Select ${input.label.toLowerCase()}`}
                        disabled={items.length === 0}
                        item={items.find(
                            (candidate) => getItemId(candidate) === boundId,
                        )}
                        items={items}
                        onChange={(field) => {
                            onSetField(
                                input.name,
                                field ? getItemId(field) : null,
                            );
                            setIsChanging(false);
                        }}
                        clearable={!input.required}
                        hasGrouping
                    />
                ) : shown ? (
                    <Group gap={6} wrap="nowrap">
                        <DataAppVizFieldTypeBadge type={shown.kind} />
                        <Text fz="xs" lineClamp={1}>
                            {shown.label}
                        </Text>
                    </Group>
                ) : (
                    <Text fz="xs" c="dimmed">
                        No match
                    </Text>
                )}
            </Table.Td>
            <Table.Td>
                <Text fz="xs" c="dimmed" lh={1.4}>
                    {why}
                </Text>
            </Table.Td>
            <Table.Td className={classes.changeCell}>
                {!isChanging && (
                    <Anchor
                        component="button"
                        type="button"
                        size="xs"
                        fw={500}
                        onClick={() => setIsChanging(true)}
                    >
                        Change
                    </Anchor>
                )}
            </Table.Td>
        </Table.Tr>
    );
};

/**
 * What Chart Studio found to build this chart on, grown up from the composer.
 * Everything here is read from field definitions: the map, a change to it and
 * every re-ask leave the warehouse alone. Only "Run once and build" queries.
 */
const SuggestedDataSheet: FC<Props> = ({
    data,
    fieldMapping,
    itemsMap,
    fit,
    isRunning,
    runError,
    onSetField,
    onChooseAlternative,
    onUseSampleData,
    onSomethingElse,
    onRunOnceAndBuild,
}) => {
    if (data === null) {
        return (
            <Box
                className={classes.sheet}
                role="status"
                aria-label="Finding data for this chart"
            >
                <Group className={classes.header} gap="xs" wrap="nowrap">
                    <MantineIcon
                        icon={IconSparkles}
                        size={14}
                        color="indigo.5"
                    />
                    <Text className={classes.title} fz="xs" fw={600}>
                        Finding data for this chart…
                    </Text>
                    <Loader size={13} color="indigo.5" />
                </Group>
            </Box>
        );
    }

    if (data.kind === 'no_data') {
        return (
            <Box
                className={classes.sheet}
                role="group"
                aria-label="Data for this chart"
            >
                <Group className={classes.header} gap="xs" wrap="nowrap">
                    <MantineIcon
                        icon={IconSparkles}
                        size={14}
                        color="indigo.5"
                    />
                    <Text className={classes.title} fz="xs" fw={600}>
                        No data found for this chart
                    </Text>
                </Group>
                <Text fz="xs" c="dimmed" lh={1.4}>
                    {data.reason}
                </Text>
                <Group gap="xs" justify="flex-end">
                    <Button
                        size="xs"
                        variant="default"
                        onClick={onSomethingElse}
                    >
                        Something else
                    </Button>
                    <Button size="xs" onClick={onUseSampleData}>
                        Use sample data instead
                    </Button>
                </Group>
            </Box>
        );
    }

    const badge = fitBadge(fit, data.fits);

    return (
        <Box
            className={classes.sheet}
            role="group"
            aria-label="Data for this chart"
        >
            <Group className={classes.header} gap="xs" wrap="nowrap">
                <MantineIcon icon={IconSparkles} size={14} color="indigo.5" />
                <Text className={classes.title} fz="xs" fw={600}>
                    Data for this chart
                </Text>
                <Badge size="xs" variant="light" color={badge.color}>
                    {badge.label}
                </Badge>
            </Group>
            <Text fz="xs" c="dimmed" lh={1.4}>
                {`${data.shapeSummary} These fields in `}
                <Text span inherit fw={500} c="ldGray.8">
                    {data.exploreLabel}
                </Text>
                {` fit. Did you have something else in mind?`}
            </Text>
            <Box className={classes.map}>
                <Table horizontalSpacing="xs" verticalSpacing={6}>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>
                                <Text fz="xs" c="dimmed">
                                    Chart input
                                </Text>
                            </Table.Th>
                            <Table.Th>
                                <Text fz="xs" c="dimmed">
                                    Field
                                </Text>
                            </Table.Th>
                            <Table.Th>
                                <Text fz="xs" c="dimmed">
                                    Why
                                </Text>
                            </Table.Th>
                            <Table.Th className={classes.changeCell} />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {data.inputs.map((input) => (
                            <InputRow
                                key={input.name}
                                input={input}
                                fieldMapping={fieldMapping}
                                itemsMap={itemsMap}
                                isExploreResolved={fit.status !== 'resolving'}
                                onSetField={onSetField}
                            />
                        ))}
                    </Table.Tbody>
                </Table>
            </Box>
            {data.alternatives.length > 0 && (
                <Group gap="xs" wrap="wrap">
                    <Text fz="xs" c="dimmed">
                        Also considered
                    </Text>
                    {data.alternatives.map((alternative) => (
                        <Button
                            key={alternative.exploreName}
                            size="compact-xs"
                            variant="default"
                            radius="xl"
                            onClick={() =>
                                onChooseAlternative(alternative.exploreName)
                            }
                        >
                            {`${alternative.exploreLabel}, ${alternative.summary}`}
                        </Button>
                    ))}
                </Group>
            )}
            {runError !== null && (
                <Text fz="xs" c="red" role="alert" lineClamp={2}>
                    {runError}
                </Text>
            )}
            <Group gap="xs" justify="flex-end" align="center">
                <Anchor
                    className={classes.sampleLink}
                    component="button"
                    type="button"
                    size="xs"
                    c="dimmed"
                    fw={500}
                    onClick={onUseSampleData}
                >
                    Use sample data instead
                </Anchor>
                <Button size="xs" variant="default" onClick={onSomethingElse}>
                    Something else
                </Button>
                <Button
                    size="xs"
                    onClick={onRunOnceAndBuild}
                    loading={isRunning}
                    disabled={!canRun(fit, data.fits)}
                >
                    Run once and build
                </Button>
            </Group>
        </Box>
    );
};

export default SuggestedDataSheet;

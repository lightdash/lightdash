import {
    getEffectiveOptionValues,
    type DataAppVizConfigOption,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
} from '@lightdash/common';
import {
    Badge,
    Box,
    CloseButton,
    Group,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { PalettePicker } from '../../../components/common/PalettePicker/PalettePicker';
import DataAppVizOptionControl from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizOptionControl';
import { groupDataAppVizOptions } from '../../../components/VisualizationConfigs/DataAppVizConfig/dataAppVizOptionGroups';
import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import {
    countVizContractChanges,
    formatVizOptionValue,
    type VizContractDiff,
} from '../utils/vizContractDiff';
import classes from './ConfigureDrawer.module.css';

type Props = {
    opened: boolean;
    onOpenChange: (opened: boolean) => void;
    schema: DataAppVizSchema;
    /** A rebuild is running, so the declared options may be about to change. */
    isBuilding: boolean;
    /** What the last build changed in the contract; null when nothing changed. */
    contractDiff: VizContractDiff | null;
    /** Only what the author explicitly changed; defaults resolve at render. */
    optionValues: DataAppVizOptionValues;
    onOptionChange: (name: string, value: DataAppVizOptionValue) => void;
    /** Preview-only; a chart using the viz owns the palette the normal way. */
    colorPaletteUuid: string | null;
    onPaletteChange: (colorPaletteUuid: string | null) => void;
};

/**
 * The builder's configuration drawer: the declared options and palette,
 * annotated with what the last rebuild changed; touching an annotated
 * control dismisses its highlight. The option and palette state lives in
 * the page, which derives the preview context from it.
 */
const ConfigureDrawer: FC<Props> = ({
    opened,
    onOpenChange,
    schema,
    isBuilding,
    contractDiff,
    optionValues,
    onOptionChange,
    colorPaletteUuid,
    onPaletteChange,
}) => {
    // Remembered per section label; a section carrying changes stays open
    // regardless, so the annotations cannot hide themselves.
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    // Change annotations the author has touched, and thereby dismissed.
    const [acknowledged, setAcknowledged] = useState<string[]>([]);

    const { data: palettes = [] } = useColorPalettes();

    const effectiveValues = useMemo(
        () => getEffectiveOptionValues(schema.configOptions, optionValues),
        [schema.configOptions, optionValues],
    );

    const setOption = (name: string, value: DataAppVizOptionValue) => {
        setAcknowledged((prev) =>
            prev.includes(name) ? prev : [...prev, name],
        );
        onOptionChange(name, value);
    };

    const optionGroups = groupDataAppVizOptions(
        schema.configOptions,
        schema.colorPalette,
    );

    const isNew = (option: DataAppVizConfigOption): boolean =>
        contractDiff !== null &&
        contractDiff.added.includes(option.name) &&
        !acknowledged.includes(option.name);
    const previousDeclaration = (
        option: DataAppVizConfigOption,
    ): DataAppVizConfigOption | null =>
        contractDiff !== null && !acknowledged.includes(option.name)
            ? (contractDiff.changed[option.name] ?? null)
            : null;

    const changeCount =
        contractDiff !== null ? countVizContractChanges(contractDiff) : 0;

    return (
        <>
            {!opened && (
                <button
                    type="button"
                    className={classes.edgeButton}
                    onClick={() => onOpenChange(true)}
                >
                    CONFIGURE
                </button>
            )}
            <Box className={classes.drawer} data-open={opened}>
                <Group justify="space-between" px="lg" pt="sm" pb={4}>
                    <Group gap="xs">
                        <Text
                            fz="xs"
                            fw={600}
                            c="ldGray.6"
                            tt="uppercase"
                            lts="0.05em"
                        >
                            Configure
                        </Text>
                        {isBuilding ? (
                            <Badge
                                size="xs"
                                variant="light"
                                color="violet"
                                tt="none"
                                className={classes.pulsing}
                            >
                                syncing…
                            </Badge>
                        ) : (
                            contractDiff !== null && (
                                <Badge
                                    size="xs"
                                    variant="light"
                                    color="violet"
                                    tt="none"
                                    className={classes.fadeIn}
                                >
                                    {`v${contractDiff.fromVersion} → v${
                                        contractDiff.toVersion
                                    } · ${changeCount} change${
                                        changeCount === 1 ? '' : 's'
                                    }`}
                                </Badge>
                            )
                        )}
                    </Group>
                    <CloseButton
                        size="sm"
                        aria-label="Close configure drawer"
                        onClick={() => onOpenChange(false)}
                    />
                </Group>
                <Box pb="sm">
                    {optionGroups.length === 0 && (
                        <Text fz="xs" c="dimmed" lh={1.5} px="lg" py="sm">
                            This chart type declares no display options.
                        </Text>
                    )}
                    {contractDiff !== null &&
                        contractDiff.removed.length > 0 && (
                            <Text fz="xs" c="dimmed" lh={1.5} px="lg" py={4}>
                                No longer declared:{' '}
                                {contractDiff.removed
                                    .map((option) => option.label)
                                    .join(', ')}
                            </Text>
                        )}
                    {optionGroups.map((group) => {
                        const hasChanges = group.options.some(
                            (option) =>
                                isNew(option) ||
                                previousDeclaration(option) !== null,
                        );
                        const isOpen = hasChanges || !collapsed[group.label];
                        const rowCount =
                            group.options.length + (group.hasPalette ? 1 : 0);
                        return (
                            <Box key={group.id}>
                                <UnstyledButton
                                    className={classes.sectionHeader}
                                    onClick={() =>
                                        setCollapsed((prev) => ({
                                            ...prev,
                                            [group.label]: isOpen,
                                        }))
                                    }
                                >
                                    <Group gap={6}>
                                        <MantineIcon
                                            icon={IconChevronDown}
                                            size={12}
                                            color="ldGray.5"
                                            className={classes.chevron}
                                            data-collapsed={!isOpen}
                                        />
                                        <Text
                                            fz={10}
                                            fw={600}
                                            c="ldGray.6"
                                            tt="uppercase"
                                            lts="0.07em"
                                        >
                                            {group.label}
                                        </Text>
                                        {hasChanges && (
                                            <Box
                                                className={classes.changeDot}
                                            />
                                        )}
                                    </Group>
                                    <Text fz={10} c="ldGray.4">
                                        {rowCount}
                                    </Text>
                                </UnstyledButton>
                                {isOpen && (
                                    <Stack gap="sm" px="lg" pt={4} pb="sm">
                                        {group.options.map((option) => {
                                            const prevDeclaration =
                                                previousDeclaration(option);
                                            const added = isNew(option);
                                            return (
                                                <Box
                                                    key={option.name}
                                                    className={
                                                        classes.optionRow
                                                    }
                                                    data-new={
                                                        added || undefined
                                                    }
                                                    data-changed={
                                                        (prevDeclaration !==
                                                            null &&
                                                            !added) ||
                                                        undefined
                                                    }
                                                >
                                                    <DataAppVizOptionControl
                                                        option={option}
                                                        value={
                                                            effectiveValues[
                                                                option.name
                                                            ]
                                                        }
                                                        onChange={(value) =>
                                                            setOption(
                                                                option.name,
                                                                value,
                                                            )
                                                        }
                                                    />
                                                    {added &&
                                                        contractDiff !==
                                                            null && (
                                                            <Badge
                                                                size="xs"
                                                                variant="light"
                                                                color="green"
                                                                mt={4}
                                                            >
                                                                {`New in v${contractDiff.toVersion}`}
                                                            </Badge>
                                                        )}
                                                    {prevDeclaration !== null &&
                                                        !added && (
                                                            <Text
                                                                fz="xs"
                                                                c="ldGray.5"
                                                                mt={2}
                                                            >
                                                                Previously{' '}
                                                                <Text
                                                                    span
                                                                    inherit
                                                                    td="line-through"
                                                                >
                                                                    {formatVizOptionValue(
                                                                        prevDeclaration,
                                                                        prevDeclaration.default,
                                                                    )}
                                                                </Text>
                                                            </Text>
                                                        )}
                                                </Box>
                                            );
                                        })}
                                        {group.hasPalette && (
                                            <PalettePicker
                                                label="Color palette"
                                                value={colorPaletteUuid}
                                                onChange={onPaletteChange}
                                                palettes={palettes}
                                                parentLabel="Project default"
                                                showPreview={false}
                                            />
                                        )}
                                    </Stack>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            </Box>
        </>
    );
};

export default ConfigureDrawer;

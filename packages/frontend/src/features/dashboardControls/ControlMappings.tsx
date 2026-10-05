import { getItemId } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { clsx } from 'clsx';
import {
    startTransition,
    useEffect,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import FieldSelect from '../../components/common/FieldSelect';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    useDashboardControls,
    useMappableSummary,
    type ControlModel,
} from './context';
import ControlItemIcon from './ControlItemIcon';
import classes from './dashboardControls.module.css';
import ItemLabel from './ItemLabel';
import { formatDisplayLabel, getDisplayLabels } from './labels';
import { getShownTarget } from './overview';
import { DATA_APPS_LINE_ID, formatTileCount } from './tiles';

// A click on a line's tile count: shows its tiles on every dashboard tab and
// goes to the first of them, or clears them when they are the ones shown.
// The popover stays open.
const useToggleShownTiles = (model: ControlModel) => {
    const navigate = useNavigate();
    const { search } = useLocation();
    // The identifiers already in the URL: changing them would reload the dashboard
    const { projectUuid, dashboardUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();
    const { tabs, isEditMode, shownItemId, showTiles, clearShownTiles } =
        useDashboardControls();
    const activeTabUuid = useDashboardContext((c) => c.activeTab?.uuid) ?? null;

    return (itemId: string, name: string, tileUuids: string[]) => {
        if (shownItemId === itemId) {
            clearShownTiles();
            return;
        }
        const target = getShownTarget({
            tiles: model.overviewTiles,
            tabUuids: tabs.map((tab) => tab.uuid),
            activeTabUuid,
            tileUuids,
        });
        if (!target) return;
        if (
            target.tabUuid !== null &&
            target.tabUuid !== activeTabUuid &&
            projectUuid &&
            dashboardUuid
        ) {
            const pathname = `/projects/${projectUuid}/dashboards/${dashboardUuid}/${isEditMode ? 'edit' : 'view'}/tabs/${target.tabUuid}`;
            // As the tab bar does: the current tab stays up while the next mounts
            startTransition(() => {
                void navigate({ pathname, search }, { replace: true });
            });
        }
        showTiles(itemId, name, tileUuids, target.tileUuid);
    };
};

type LineProps = {
    icon: ReactNode;
    label: ReactNode;
    // The tiles the line stands for: outlined while it is hovered or focused
    tileUuids: string[];
    isDimmed: boolean;
    children: ReactNode;
};

// One field or parameter: what it is, then its count and what can be done
const MappingLine: FC<LineProps> = ({
    icon,
    label,
    tileUuids,
    isDimmed,
    children,
}) => {
    const { hoverTiles } = useDashboardControls();
    const highlight = () => hoverTiles(tileUuids);
    const clear = () => hoverTiles([]);

    return (
        <Group
            gap="xs"
            wrap="nowrap"
            className={classes.mappingLine}
            data-dimmed={isDimmed || undefined}
            onMouseEnter={highlight}
            onMouseLeave={clear}
            onFocus={highlight}
            onBlur={clear}
        >
            {icon}
            <Text
                fz="xs"
                truncate
                flex={1}
                miw={0}
                c={isDimmed ? 'dimmed' : undefined}
            >
                {label}
            </Text>
            {children}
        </Group>
    );
};

type PickerProps = {
    model: ControlModel;
    // Opened by "Add field": it starts open and goes away when it closes
    isAdding: boolean;
    onClose: () => void;
};

// The picker for one more field or parameter. Its dropdown opens inside the
// popover, so choosing never counts as a click outside it.
const ControlPicker: FC<PickerProps> = ({ model, isAdding, onClose }) => {
    const { subPopoverProps } = useDashboardControls();
    const { noun, overview, items, isLoading } = model;
    const [search, setSearch] = useState('');
    const parameterInputRef = useRef<HTMLInputElement>(null);

    // It starts open without reporting in, and can go away while open
    useEffect(() => {
        if (isAdding) {
            subPopoverProps.onOpen();
            parameterInputRef.current?.focus();
        }
        return subPopoverProps.onClose;
    }, [isAdding, subPopoverProps]);

    const handleDropdownClose = () => {
        subPopoverProps.onClose();
        if (isAdding) onClose();
    };
    const cancel = isAdding ? (
        <ActionIcon size="sm" aria-label="Cancel" onClick={onClose}>
            <MantineIcon icon={IconX} />
        </ActionIcon>
    ) : undefined;

    if (noun === 'field') {
        const fields = overview.others.flatMap(({ id }) => {
            const field = model.getField(id);
            return field ? [field] : [];
        });
        return (
            <FieldSelect
                size="xs"
                disabled={isLoading}
                aria-label="Select a field"
                placeholder={isAdding ? undefined : 'Select a field'}
                // Choosing adds a line; the picker itself holds nothing
                item={undefined}
                items={fields}
                focusOnRender={isAdding}
                defaultDropdownOpened={isAdding}
                comboboxProps={{ withinPortal: false }}
                onDropdownOpen={subPopoverProps.onOpen}
                onDropdownClose={handleDropdownClose}
                rightSection={cancel}
                onChange={(field) => {
                    if (field) model.addItem(getItemId(field));
                }}
            />
        );
    }

    // The options are told apart among themselves and from the lines
    const pickerLabels = getDisplayLabels(
        [...overview.rows, ...overview.others].flatMap(({ id }) =>
            items[id] ? [items[id]] : [],
        ),
    );
    return (
        <Select
            ref={parameterInputRef}
            size="xs"
            searchable
            disabled={isLoading}
            aria-label="Select a parameter"
            placeholder="Select a parameter"
            value={null}
            data={overview.others.map((option) => ({
                value: option.id,
                label: `${formatDisplayLabel(pickerLabels[option.id])} · ${formatTileCount(option.tileUuids.length)}`,
            }))}
            renderOption={({ option }) => (
                <Text fz="xs" truncate>
                    <ItemLabel display={pickerLabels[option.value]} />
                    <Text span inherit c="dimmed">
                        {` · ${formatTileCount(
                            overview.others.find(
                                (other) => other.id === option.value,
                            )?.tileUuids.length ?? 0,
                        )}`}
                    </Text>
                </Text>
            )}
            defaultDropdownOpened={isAdding}
            comboboxProps={{ withinPortal: false }}
            onDropdownOpen={subPopoverProps.onOpen}
            onDropdownClose={handleDropdownClose}
            rightSection={cancel}
            rightSectionPointerEvents={cancel ? 'all' : undefined}
            searchValue={search}
            onSearchChange={setSearch}
            onChange={(id) => {
                if (!id) return;
                model.addItem(id);
                setSearch('');
            }}
        />
    );
};

// "Add field": the button, or the picker it turns into while adding
const AddItem: FC<{ model: ControlModel }> = ({ model }) => {
    const [isAdding, setIsAdding] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const wasAdding = useRef(false);

    // Focus goes back to the button the picker came from
    useEffect(() => {
        if (!isAdding && wasAdding.current) buttonRef.current?.focus();
        wasAdding.current = isAdding;
    }, [isAdding]);

    if (isAdding) {
        return (
            <ControlPicker
                model={model}
                isAdding
                onClose={() => setIsAdding(false)}
            />
        );
    }
    return (
        <Box>
            <Button
                ref={buttonRef}
                variant="subtle"
                color="gray"
                size="compact-xs"
                leftSection={<MantineIcon icon={IconPlus} />}
                disabled={model.isLoading}
                onClick={() => setIsAdding(true)}
            >
                {model.noun === 'field' ? 'Add field' : 'Add parameter'}
            </Button>
        </Box>
    );
};

const noop = () => {};

// What the control applies through, as a short list: one line per field or
// parameter, then the ones named alike that could join, then adding one.
// Every line ends the same way: its action, its tile count, its remove.
const ControlMappings: FC<{ model: ControlModel }> = ({ model }) => {
    const { draft, hasChanges, shownItemId, hoverTiles } =
        useDashboardControls();
    const toggleShownTiles = useToggleShownTiles(model);
    const { overview, rowLabels, isLoading } = model;
    const summary = useMappableSummary(null);
    const hasRows = overview.rows.length > 0;
    const switchedOn = overview.switchedOnTileUuids;
    const hasLines = hasRows || switchedOn.length > 0;
    const canAdd = overview.others.length > 0;
    // A new control nobody touched yet has nothing to count
    const hasLead = hasLines || !draft?.isNew || hasChanges;
    const through = hasLines ? ' through' : '';
    const getIcon = (id: string) => <ControlItemIcon model={model} id={id} />;
    const renderCount = (id: string, name: string, tileUuids: string[]) => {
        const count = formatTileCount(tileUuids.length);
        const isShown = shownItemId === id;
        return (
            <Tooltip label="Show tiles">
                <Button
                    size="compact-xs"
                    variant={isShown ? 'light' : 'subtle'}
                    color="gray"
                    justify="flex-end"
                    className={classes.count}
                    aria-pressed={isShown}
                    aria-label={`Show ${count} for ${name}`}
                    onClick={() => toggleShownTiles(id, name, tileUuids)}
                >
                    {count}
                </Button>
            </Tooltip>
        );
    };
    // The room of a remove button on a line that has none
    const removeSpacer = (
        <ActionIcon
            component="span"
            size="sm"
            aria-hidden
            className={classes.lineSpacer}
        />
    );

    return (
        <Stack gap="xs">
            {hasLead &&
                (isLoading ? (
                    <Group gap="xs" wrap="nowrap">
                        <Text fz="xs" c="dimmed">
                            Applies to
                        </Text>
                        <Loader size="xs" />
                        <Text fz="xs" c="dimmed">
                            {`tiles${through}`}
                        </Text>
                    </Group>
                ) : (
                    <Tooltip label={summary} position="top-start">
                        <Text fz="xs" c="dimmed" w="fit-content">
                            {`Applies to ${overview.mappedCount} of ${overview.mappableCount} tiles${through}`}
                        </Text>
                    </Tooltip>
                ))}

            {(hasLines || overview.suggestions.length > 0) && (
                <Stack gap="xxs">
                    {overview.rows.map((row) => {
                        const label = formatDisplayLabel(rowLabels[row.id]);
                        const remaining = row.remainingTileUuids.length;
                        return (
                            <MappingLine
                                key={row.id}
                                icon={getIcon(row.id)}
                                label={
                                    <ItemLabel display={rowLabels[row.id]} />
                                }
                                tileUuids={row.tileUuids}
                                isDimmed={false}
                            >
                                {remaining > 0 && (
                                    <Button
                                        size="compact-xs"
                                        variant="default"
                                        flex="0 0 auto"
                                        disabled={isLoading}
                                        // Outlines the tiles it would add,
                                        // not the ones the line stands for
                                        onMouseEnter={() =>
                                            hoverTiles(row.remainingTileUuids)
                                        }
                                        onMouseLeave={() =>
                                            hoverTiles(row.tileUuids)
                                        }
                                        onFocus={(event) => {
                                            event.stopPropagation();
                                            hoverTiles(row.remainingTileUuids);
                                        }}
                                        onClick={() => model.addItem(row.id)}
                                    >
                                        {remaining === 1
                                            ? 'Add 1 more tile'
                                            : `Add ${remaining} more tiles`}
                                    </Button>
                                )}
                                {renderCount(row.id, label, row.tileUuids)}
                                <Tooltip label="Remove">
                                    <ActionIcon
                                        size="sm"
                                        disabled={isLoading}
                                        aria-label={`Remove ${label}`}
                                        onClick={() => model.removeItem(row.id)}
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                </Tooltip>
                            </MappingLine>
                        );
                    })}

                    {switchedOn.length > 0 && (
                        <MappingLine
                            icon={null}
                            label={
                                <Text span inherit fw={500}>
                                    Data apps
                                </Text>
                            }
                            tileUuids={switchedOn}
                            isDimmed={false}
                        >
                            {renderCount(
                                DATA_APPS_LINE_ID,
                                'Data apps',
                                switchedOn,
                            )}
                            {removeSpacer}
                        </MappingLine>
                    )}

                    {overview.suggestions.map((option) => (
                        <MappingLine
                            key={option.id}
                            icon={getIcon(option.id)}
                            label={<ItemLabel display={rowLabels[option.id]} />}
                            tileUuids={option.tileUuids}
                            isDimmed
                        >
                            <Button
                                size="compact-xs"
                                variant="default"
                                flex="0 0 auto"
                                disabled={isLoading}
                                aria-label={`Add ${formatDisplayLabel(rowLabels[option.id])}`}
                                onClick={() => model.addItem(option.id)}
                            >
                                Add
                            </Button>
                            {/* The count button's box, so counts end in one column */}
                            <Button
                                component="span"
                                size="compact-xs"
                                variant="subtle"
                                color="gray"
                                justify="flex-end"
                                className={clsx(
                                    classes.count,
                                    classes.countStatic,
                                )}
                            >
                                {formatTileCount(option.tileUuids.length)}
                            </Button>
                            {removeSpacer}
                        </MappingLine>
                    ))}
                </Stack>
            )}

            {canAdd &&
                (hasRows ? (
                    <AddItem model={model} />
                ) : (
                    <ControlPicker
                        model={model}
                        isAdding={false}
                        onClose={noop}
                    />
                ))}
        </Stack>
    );
};

export default ControlMappings;

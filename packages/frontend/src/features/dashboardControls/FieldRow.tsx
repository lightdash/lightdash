import { type DashboardFilterableField } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconEye } from '@tabler/icons-react';
import { type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './FieldsAndTiles.module.css';
import { type FieldScope } from './peers';

const pluralizeTiles = (count: number): string =>
    count === 1 ? 'tile' : 'tiles';

// Which tiles a menu item acts on
export type TileScope = 'this-tab' | 'every-tab';

const joinLabels = (labels: string[]): string =>
    labels.length < 2
        ? labels.join('')
        : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;

type ApplyItemsProps = {
    label: string;
    scope: FieldScope;
    replacedLabels: string[];
    // Ends each `aria-label`: " on this tab", or nothing without tabs
    scopeSuffix: string;
    onAddToUnfiltered: () => void;
    onAll: () => void;
};

// The two apply items of one scope
const ApplyItems: FC<ApplyItemsProps> = ({
    label,
    scope,
    replacedLabels,
    scopeSuffix,
    onAddToUnfiltered,
    onAll,
}) => {
    const { possible, unfiltered, replaced } = scope;
    const replaces = `Replaces ${joinLabels(replacedLabels)} on ${replaced} ${pluralizeTiles(replaced)}`;
    const allLabel = `Apply ${label} to all ${possible} ${pluralizeTiles(possible)}${scopeSuffix}`;
    return (
        <>
            <Menu.Item
                disabled={unfiltered === 0}
                aria-label={`Add ${label} to the ${unfiltered} unfiltered ${pluralizeTiles(unfiltered)}${scopeSuffix}`}
                rightSection={
                    <Text fz="xs" c="dimmed" className={classes.itemCount}>
                        {unfiltered}
                    </Text>
                }
                onClick={onAddToUnfiltered}
            >
                Unfiltered tiles
            </Menu.Item>
            <Menu.Item
                disabled={unfiltered + replaced === 0}
                aria-label={
                    replaced > 0 ? `${allLabel}. ${replaces}` : allLabel
                }
                rightSection={
                    <Text fz="xs" c="dimmed" className={classes.itemCount}>
                        {possible}
                    </Text>
                }
                onClick={onAll}
            >
                All tiles
                {replaced > 0 && (
                    <Text fz="xs" c="dimmed">
                        {replaces}
                    </Text>
                )}
            </Menu.Item>
        </>
    );
};

const getScopeHeading = (name: string, scope: FieldScope): string =>
    scope.possible === 0 && scope.applied === 0
        ? `${name} · no tiles`
        : `${name} · ${scope.applied} of ${scope.possible}`;

type Props = {
    field: DashboardFilterableField | null;
    label: string;
    tableLabel: string;
    // Counted over the tiles of the active tab; null on a dashboard without tabs
    thisTabScope: FieldScope | null;
    // Names of the fields "All tiles" would take off their tiles on this tab
    thisTabReplacedLabels: string[];
    // Counted over every tile
    everyTabScope: FieldScope;
    everyTabReplacedLabels: string[];
    isHighlighted: boolean;
    // On no tile yet
    isWaiting: boolean;
    onToggleHighlight: () => void;
    onHoverChange: (isHovered: boolean) => void;
    onAddToUnfiltered: (tileScope: TileScope) => void;
    onAll: (tileScope: TileScope) => void;
    onClear: (tileScope: TileScope) => void;
    onRemove: () => void;
    // Why the row cannot be removed, or null when it can
    removeDisabledReason: string | null;
};

export const FieldRow: FC<Props> = ({
    field,
    label,
    tableLabel,
    thisTabScope,
    thisTabReplacedLabels,
    everyTabScope,
    everyTabReplacedLabels,
    isHighlighted,
    isWaiting,
    onToggleHighlight,
    onHoverChange,
    onAddToUnfiltered,
    onAll,
    onClear,
    onRemove,
    removeDisabledReason,
}) => {
    const { applied, possible } = everyTabScope;
    const canRemove = removeDisabledReason === null;

    return (
        <Stack
            className={
                isHighlighted
                    ? `${classes.row} ${classes.rowHighlighted}`
                    : classes.row
            }
            gap={0}
            data-waiting={isWaiting || undefined}
            onMouseEnter={() => onHoverChange(true)}
            onMouseLeave={() => onHoverChange(false)}
        >
            <Group gap={0} wrap="nowrap" align="flex-start">
                <UnstyledButton
                    className={classes.rowMain}
                    data-highlighted={isHighlighted || undefined}
                    aria-pressed={isHighlighted}
                    onClick={onToggleHighlight}
                    onFocus={() => onHoverChange(true)}
                    onBlur={() => onHoverChange(false)}
                >
                    <Group gap="xs" wrap="nowrap" className={classes.rowLabel}>
                        {field !== null && (
                            <FieldIcon item={field} size={14} aria-hidden />
                        )}
                        <Text fz="sm" fw={600} truncate>
                            {label}
                        </Text>
                    </Group>
                </UnstyledButton>
                <Tooltip
                    label={
                        isHighlighted
                            ? 'Showing only these tiles'
                            : 'Show only these tiles'
                    }
                >
                    <ActionIcon
                        className={classes.rowEye}
                        size="sm"
                        variant={isHighlighted ? 'filled' : 'subtle'}
                        color={isHighlighted ? 'blue' : 'gray'}
                        mt="xs"
                        mr="xs"
                        flex="0 0 auto"
                        aria-pressed={isHighlighted}
                        aria-label={`Show only tiles filtered by ${label}`}
                        onClick={onToggleHighlight}
                    >
                        <MantineIcon icon={IconEye} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <Group
                className={classes.rowActions}
                gap="xs"
                justify="space-between"
                wrap="nowrap"
            >
                <Text
                    key={`${applied}/${possible}`}
                    fz="xs"
                    c="dimmed"
                    truncate
                    className={classes.rowCount}
                >
                    {`${tableLabel} · ${applied} of ${possible} ${pluralizeTiles(possible)}`}
                </Text>
                <Menu position="bottom-end" width={240}>
                    <Menu.Target>
                        <Button
                            size="compact-xs"
                            variant="default"
                            flex="0 0 auto"
                            rightSection={
                                <MantineIcon icon={IconChevronDown} size="sm" />
                            }
                            aria-label={`Apply to tiles: ${label}`}
                        >
                            Apply to
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        {thisTabScope !== null && (
                            <>
                                <Menu.Label>
                                    {getScopeHeading('This tab', thisTabScope)}
                                </Menu.Label>
                                <ApplyItems
                                    label={label}
                                    scope={thisTabScope}
                                    replacedLabels={thisTabReplacedLabels}
                                    scopeSuffix=" on this tab"
                                    onAddToUnfiltered={() =>
                                        onAddToUnfiltered('this-tab')
                                    }
                                    onAll={() => onAll('this-tab')}
                                />
                                <Menu.Label>
                                    {getScopeHeading(
                                        'Every tab',
                                        everyTabScope,
                                    )}
                                </Menu.Label>
                            </>
                        )}
                        <ApplyItems
                            label={label}
                            scope={everyTabScope}
                            replacedLabels={everyTabReplacedLabels}
                            scopeSuffix={
                                thisTabScope === null ? '' : ' on every tab'
                            }
                            onAddToUnfiltered={() =>
                                onAddToUnfiltered('every-tab')
                            }
                            onAll={() => onAll('every-tab')}
                        />
                        <Menu.Divider />
                        {thisTabScope !== null && (
                            <Menu.Item
                                disabled={thisTabScope.applied === 0}
                                onClick={() => onClear('this-tab')}
                            >
                                Clear from this tab
                            </Menu.Item>
                        )}
                        <Menu.Item
                            disabled={applied === 0}
                            onClick={() => onClear('every-tab')}
                        >
                            {thisTabScope === null
                                ? 'Clear from tiles'
                                : 'Clear from every tab'}
                        </Menu.Item>
                        <Menu.Divider />
                        {/* Not `disabled`: the arrow keys still reach it, so
                            the reason can be read */}
                        <Tooltip
                            label={removeDisabledReason}
                            disabled={canRemove}
                            events={{ hover: true, focus: true, touch: true }}
                        >
                            <Menu.Item
                                closeMenuOnClick={canRemove}
                                aria-disabled={!canRemove || undefined}
                                c={canRemove ? undefined : 'dimmed'}
                                onClick={() => {
                                    if (canRemove) onRemove();
                                }}
                            >
                                Remove field
                            </Menu.Item>
                        </Tooltip>
                    </Menu.Dropdown>
                </Menu>
            </Group>
        </Stack>
    );
};

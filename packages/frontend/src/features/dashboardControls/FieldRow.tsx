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

const hasApplyItems = ({ unfiltered, replaced }: FieldScope): boolean =>
    unfiltered + replaced > 0;

// The apply items of one scope; one that would change nothing is left out
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
            {unfiltered > 0 && (
                <Menu.Item
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
            )}
            {/* With nothing to replace it would only repeat the item above */}
            {replaced > 0 && (
                <Menu.Item
                    aria-label={`${allLabel}. ${replaces}`}
                    rightSection={
                        <Text fz="xs" c="dimmed" className={classes.itemCount}>
                            {possible}
                        </Text>
                    }
                    onClick={onAll}
                >
                    All tiles
                    <Text fz="xs" c="dimmed">
                        {replaces}
                    </Text>
                </Menu.Item>
            )}
        </>
    );
};

const getScopeHeading = (name: string, scope: FieldScope): string =>
    `${name} · ${scope.applied} of ${scope.possible}`;

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
}) => {
    const { applied, possible } = everyTabScope;
    const hasTabs = thisTabScope !== null;
    const showThisTabApply =
        thisTabScope !== null && hasApplyItems(thisTabScope);
    const showEveryTabApply = hasApplyItems(everyTabScope);
    const showThisTabClear = thisTabScope !== null && thisTabScope.applied > 0;
    const showEveryTabClear = applied > 0;
    const hasApplySection = showThisTabApply || showEveryTabApply;
    const hasClearSection = showThisTabClear || showEveryTabClear;

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
            <Group className={classes.rowHeader} gap="xs" wrap="nowrap">
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
                        variant={isHighlighted ? 'light' : 'subtle'}
                        color={isHighlighted ? 'blue' : 'gray'}
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
                        {thisTabScope !== null && showThisTabApply && (
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
                            </>
                        )}
                        {showEveryTabApply && (
                            <>
                                {hasTabs && (
                                    <Menu.Label>
                                        {getScopeHeading(
                                            'Every tab',
                                            everyTabScope,
                                        )}
                                    </Menu.Label>
                                )}
                                <ApplyItems
                                    label={label}
                                    scope={everyTabScope}
                                    replacedLabels={everyTabReplacedLabels}
                                    scopeSuffix={hasTabs ? ' on every tab' : ''}
                                    onAddToUnfiltered={() =>
                                        onAddToUnfiltered('every-tab')
                                    }
                                    onAll={() => onAll('every-tab')}
                                />
                            </>
                        )}
                        {hasApplySection && hasClearSection && <Menu.Divider />}
                        {showThisTabClear && (
                            <Menu.Item onClick={() => onClear('this-tab')}>
                                Clear from this tab
                            </Menu.Item>
                        )}
                        {showEveryTabClear && (
                            <Menu.Item onClick={() => onClear('every-tab')}>
                                {hasTabs
                                    ? 'Clear from every tab'
                                    : 'Clear from tiles'}
                            </Menu.Item>
                        )}
                        {(hasApplySection || hasClearSection) && (
                            <Menu.Divider />
                        )}
                        <Menu.Item onClick={onRemove}>Remove field</Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Group>
        </Stack>
    );
};

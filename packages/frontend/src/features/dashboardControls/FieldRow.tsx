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
import { IconDots, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './FieldsAndTiles.module.css';
import { type FieldScope } from './peers';

const pluralizeTiles = (count: number): string =>
    count === 1 ? 'tile' : 'tiles';

const SHOW_ALL_TILES = 'Show all tiles';

// Which tiles a row counts and acts on; null on a dashboard without tabs
export type TileScope = 'this-tab' | 'every-tab';

const SCOPE_SUFFIX: Record<TileScope, string> = {
    'this-tab': ' on this tab',
    'every-tab': ' on every tab',
};

const CLEAR_LABEL: Record<TileScope, string> = {
    'this-tab': 'Clear from this tab',
    'every-tab': 'Clear from every tab',
};

const joinLabels = (labels: string[]): string =>
    labels.length < 2
        ? labels.join('')
        : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;

// The way out of a clicked row; render it right after the row's name button.
// It leaves the page once clicked, so focus is handed back to that button
const ShowAllTilesButton: FC<{ onClick: () => void }> = ({ onClick }) => (
    <Tooltip label={SHOW_ALL_TILES}>
        <ActionIcon
            className={classes.rowUnpin}
            size="sm"
            variant="subtle"
            color="gray"
            mt="xs"
            mr="xs"
            flex="0 0 auto"
            aria-label={SHOW_ALL_TILES}
            onClick={(event) => {
                const rowButton = event.currentTarget.previousElementSibling;
                if (rowButton instanceof HTMLElement) rowButton.focus();
                onClick();
            }}
        >
            <MantineIcon icon={IconX} />
        </ActionIcon>
    </Tooltip>
);

type Props = {
    field: DashboardFilterableField | null;
    label: string;
    tableLabel: string;
    // Counted over the tiles in scope
    scope: FieldScope;
    tileScope: TileScope | null;
    // Names of the fields "all" would take off their tiles
    replacedLabels: string[];
    isHighlighted: boolean;
    // On no tile yet
    isWaiting: boolean;
    onToggleHighlight: () => void;
    onClearHighlight: () => void;
    onHoverChange: (isHovered: boolean) => void;
    onAddToUnfiltered: () => void;
    onAll: () => void;
    onClear: () => void;
    onRemove: () => void;
    // Why the row cannot be removed, or null when it can
    removeDisabledReason: string | null;
};

export const FieldRow: FC<Props> = ({
    field,
    label,
    tableLabel,
    scope,
    tileScope,
    replacedLabels,
    isHighlighted,
    isWaiting,
    onToggleHighlight,
    onClearHighlight,
    onHoverChange,
    onAddToUnfiltered,
    onAll,
    onClear,
    onRemove,
    removeDisabledReason,
}) => {
    const { applied, possible, unfiltered, replaced } = scope;
    const showAdd = unfiltered > 0 && (applied > 0 || replaced > 0);
    const showAll = replaced > 0 || (unfiltered > 0 && applied === 0);
    const showClear = applied > 0;
    const scopeSuffix = tileScope === null ? '' : SCOPE_SUFFIX[tileScope];
    const replaces = `Replaces ${joinLabels(replacedLabels)} on ${replaced} ${pluralizeTiles(replaced)}`;
    const allLabel = `Apply ${label} to all ${possible} ${pluralizeTiles(possible)}${scopeSuffix}`;
    const isEmptyTab =
        tileScope === 'this-tab' && possible === 0 && applied === 0;
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
            data-keeps-field
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
                {isHighlighted && (
                    <ShowAllTilesButton onClick={onClearHighlight} />
                )}
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
                    {isEmptyTab
                        ? `${tableLabel} · no tiles on this tab`
                        : `${tableLabel} · ${applied} of ${possible} ${pluralizeTiles(possible)}`}
                </Text>
                <Group gap={4} wrap="nowrap" flex="0 0 auto">
                    {showAdd && (
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            aria-label={`Add ${label} to the ${unfiltered} unfiltered ${pluralizeTiles(unfiltered)}${scopeSuffix}`}
                            onClick={onAddToUnfiltered}
                        >
                            Add to {unfiltered} unfiltered
                        </Button>
                    )}
                    {showAll && (
                        <Tooltip
                            label={replaces}
                            disabled={replaced === 0}
                            events={{ hover: true, focus: true, touch: true }}
                        >
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                // The safe action leads when there are two
                                color={showAdd ? 'gray' : undefined}
                                aria-label={
                                    replaced > 0
                                        ? `${allLabel}. ${replaces}`
                                        : allLabel
                                }
                                onClick={onAll}
                            >
                                {showAdd
                                    ? `All ${possible}`
                                    : `Apply to all ${possible}`}
                            </Button>
                        </Tooltip>
                    )}
                    <Menu position="bottom-end">
                        <Menu.Target>
                            <Tooltip label="More">
                                <ActionIcon
                                    size="sm"
                                    variant="subtle"
                                    color="gray"
                                    aria-label={`More actions for ${label}`}
                                >
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Tooltip>
                        </Menu.Target>
                        <Menu.Dropdown>
                            {showClear && (
                                <Menu.Item onClick={onClear}>
                                    {tileScope === null
                                        ? 'Clear from tiles'
                                        : CLEAR_LABEL[tileScope]}
                                </Menu.Item>
                            )}
                            {/* Not `disabled`: the arrow keys still reach
                                    it, so the reason can be read */}
                            <Tooltip
                                label={removeDisabledReason}
                                disabled={canRemove}
                                events={{
                                    hover: true,
                                    focus: true,
                                    touch: true,
                                }}
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
            </Group>
        </Stack>
    );
};

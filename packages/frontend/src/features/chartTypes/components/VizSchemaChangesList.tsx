import {
    type DataAppVizConfigOption,
    type DataAppVizConfigOptionChange,
    type DataAppVizField,
    type DataAppVizFieldChange,
    type DataAppVizSchemaChanges,
} from '@lightdash/common';
import { Group, Stack, Text } from '@mantine/core';
import {
    IconAdjustmentsHorizontal,
    IconCircle,
    IconColumns,
    IconMinus,
    IconPalette,
    IconPlus,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './VizSchemaChangesList.module.css';

type ChangeKind = 'added' | 'updated' | 'removed';

const CHANGE_LABEL: Record<ChangeKind, string> = {
    added: 'Added',
    updated: 'Updated',
    removed: 'Removed',
};

const CHANGE_ICON: Record<ChangeKind, typeof IconPlus> = {
    added: IconPlus,
    updated: IconCircle,
    removed: IconMinus,
};

const CHANGE_COLOR: Record<ChangeKind, string> = {
    added: 'green.7',
    updated: 'yellow.7',
    removed: 'red.7',
};

const CHANGE_ORDER: ChangeKind[] = ['added', 'updated', 'removed'];

type ChangeRow = {
    key: string;
    kind: ChangeKind;
    icon: typeof IconPlus;
    label: string;
    detail: string | null;
};

const describeField = (field: DataAppVizField) =>
    `${field.type} field${field.required ? ', required' : ''}`;

const describeFieldChange = ({ before, after }: DataAppVizFieldChange) => {
    const parts: string[] = [];
    if (before.type !== after.type)
        parts.push(`${before.type} → ${after.type}`);
    if (before.required !== after.required)
        parts.push(after.required ? 'now required' : 'now optional');
    if (before.label !== after.label)
        parts.push(`renamed from "${before.label}"`);
    return parts.join(', ');
};

const formatDefault = (value: DataAppVizConfigOption['default']) =>
    typeof value === 'string' ? JSON.stringify(value) : String(value);

const describeDefaultChange = (
    before: DataAppVizConfigOption['default'],
    after: DataAppVizConfigOption['default'],
) =>
    before === '' || after === ''
        ? 'default changed'
        : `default ${formatDefault(before)} → ${formatDefault(after)}`;

const describeOptionChange = ({
    before,
    after,
}: DataAppVizConfigOptionChange) => {
    const parts: string[] = [];
    if (before.type !== after.type)
        parts.push(`${before.type} → ${after.type}`);
    if (before.default !== after.default)
        parts.push(describeDefaultChange(before.default, after.default));
    if (before.type === 'select' && after.type === 'select') {
        const beforeValues = before.choices.map((c) => c.value);
        const afterValues = after.choices.map((c) => c.value);
        const gained = afterValues.filter((v) => !beforeValues.includes(v));
        const lost = beforeValues.filter((v) => !afterValues.includes(v));
        if (gained.length > 0) parts.push(`adds ${gained.join(', ')}`);
        if (lost.length > 0) parts.push(`drops ${lost.join(', ')}`);
    }
    if (before.type === 'number' && after.type === 'number') {
        if (before.min !== after.min || before.max !== after.max)
            parts.push('range changed');
    }
    if (before.label !== after.label)
        parts.push(`renamed from "${before.label}"`);
    return parts.join(', ');
};

const toRows = (changes: DataAppVizSchemaChanges): ChangeRow[] => [
    ...changes.fields.added.map((f) => ({
        key: `f+${f.name}`,
        kind: 'added' as const,
        icon: IconColumns,
        label: f.label,
        detail: describeField(f),
    })),
    ...changes.fields.changed.map((c) => ({
        key: `f~${c.after.name}`,
        kind: 'updated' as const,
        icon: IconColumns,
        label: c.after.label,
        detail: describeFieldChange(c),
    })),
    ...changes.fields.removed.map((f) => ({
        key: `f-${f.name}`,
        kind: 'removed' as const,
        icon: IconColumns,
        label: f.label,
        detail: describeField(f),
    })),
    ...changes.configOptions.added.map((o) => ({
        key: `o+${o.name}`,
        kind: 'added' as const,
        icon: IconAdjustmentsHorizontal,
        label: o.label,
        detail: `${o.type} option`,
    })),
    ...changes.configOptions.changed.map((c) => ({
        key: `o~${c.after.name}`,
        kind: 'updated' as const,
        icon: IconAdjustmentsHorizontal,
        label: c.after.label,
        detail: describeOptionChange(c),
    })),
    ...changes.configOptions.removed.map((o) => ({
        key: `o-${o.name}`,
        kind: 'removed' as const,
        icon: IconAdjustmentsHorizontal,
        label: o.label,
        detail: `${o.type} option`,
    })),
    ...(changes.colorPalette === 'unchanged'
        ? []
        : [
              {
                  key: 'palette',
                  kind: changes.colorPalette,
                  icon: IconPalette,
                  label: 'Color palette',
                  detail: null,
              },
          ]),
];

type Props = {
    changes: DataAppVizSchemaChanges;
    /** Denser type for narrow side panels. */
    compact?: boolean;
};

/**
 * The field, option and palette deltas between two chart type versions,
 * grouped the way field reviews are.
 */
const VizSchemaChangesList: FC<Props> = ({ changes, compact = false }) => {
    const rows = toRows(changes);
    const groups = CHANGE_ORDER.map((kind) => ({
        kind,
        rows: rows.filter((row) => row.kind === kind),
    })).filter((group) => group.rows.length > 0);
    const fz = compact ? 11 : 'sm';

    return (
        <Stack gap={compact ? 'xs' : 'md'}>
            {groups.map((group) => (
                <Stack key={group.kind} gap={2}>
                    <Group gap={6} mb={2}>
                        <MantineIcon
                            icon={CHANGE_ICON[group.kind]}
                            size={compact ? 'xs' : 'sm'}
                            color={CHANGE_COLOR[group.kind]}
                        />
                        <Text fz={fz} fw={600}>
                            {CHANGE_LABEL[group.kind]}
                        </Text>
                    </Group>
                    {group.rows.map((row) => (
                        <Group
                            key={row.key}
                            className={classes.row}
                            data-compact={compact || undefined}
                            gap="xs"
                            wrap="nowrap"
                        >
                            <MantineIcon
                                icon={row.icon}
                                size={compact ? 'xs' : 'sm'}
                                color="ldGray.6"
                            />
                            <Text fz={fz} lh={1.4} className={classes.label}>
                                <Text span fw={500}>
                                    {row.label}
                                </Text>
                                {row.detail && (
                                    <Text span c="dimmed">
                                        {' '}
                                        {row.detail}
                                    </Text>
                                )}
                            </Text>
                        </Group>
                    ))}
                </Stack>
            ))}
        </Stack>
    );
};

export default VizSchemaChangesList;

import {
    assertUnreachable,
    type DataAppVizConfigOption,
    type DataAppVizConfigOptionChange,
    type DataAppVizField,
    type DataAppVizFieldChange,
    type DataAppVizHierarchyChange,
    type DataAppVizSchemaChanges,
} from '@lightdash/common';
import { Group, Stack, Text } from '@mantine/core';
import {
    IconAdjustmentsHorizontal,
    IconCircle,
    IconColumns,
    IconHierarchy,
    IconMinus,
    IconPalette,
    IconPlus,
} from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './VizSchemaChangesList.module.css';

type ChangeKind = 'added' | 'updated' | 'removed';

const CHANGE_LABEL_KEY: Record<ChangeKind, string> = {
    added: 'schemaChanges.added',
    updated: 'schemaChanges.updated',
    removed: 'schemaChanges.removed',
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

const describeField = (t: TFunction, field: DataAppVizField) => {
    const description = field.multiple
        ? t('schemaChanges.multipleField', { type: field.type })
        : t('schemaChanges.field', { type: field.type });
    return field.required
        ? t('schemaChanges.withRequired', { description })
        : description;
};

const describeFieldChange = (
    t: TFunction,
    { before, after }: DataAppVizFieldChange,
) => {
    const parts: string[] = [];
    if (before.type !== after.type)
        parts.push(`${before.type} → ${after.type}`);
    if (before.required !== after.required)
        parts.push(
            after.required
                ? t('schemaChanges.nowRequired')
                : t('schemaChanges.nowOptional'),
        );
    if ((before.multiple === true) !== (after.multiple === true))
        parts.push(
            after.multiple
                ? t('schemaChanges.nowMultiple')
                : t('schemaChanges.nowSingle'),
        );
    if (before.label !== after.label)
        parts.push(t('schemaChanges.renamedFrom', { label: before.label }));
    return parts.join(', ');
};

const formatDefault = (
    t: TFunction,
    value: DataAppVizConfigOption['default'],
) =>
    typeof value === 'object'
        ? t('schemaChanges.gradientDefault', {
              colors: value.colors.join(', '),
              min: value.min,
              max: value.max,
          })
        : typeof value === 'string'
          ? JSON.stringify(value)
          : String(value);

const describeDefaultChange = (
    t: TFunction,
    before: DataAppVizConfigOption['default'],
    after: DataAppVizConfigOption['default'],
) =>
    before === '' || after === ''
        ? t('schemaChanges.defaultChanged')
        : t('schemaChanges.defaultFromTo', {
              before: formatDefault(t, before),
              after: formatDefault(t, after),
          });

const describeOptionChange = (
    t: TFunction,
    { before, after }: DataAppVizConfigOptionChange,
) => {
    const parts: string[] = [];
    if (before.type !== after.type)
        parts.push(`${before.type} → ${after.type}`);
    if (before.type === 'gradient' && after.type === 'gradient') {
        const sameDefault =
            before.default.min === after.default.min &&
            before.default.max === after.default.max &&
            before.default.colors.length === after.default.colors.length &&
            before.default.colors.every(
                (color, index) => color === after.default.colors[index],
            );
        if (!sameDefault)
            parts.push(describeDefaultChange(t, before.default, after.default));
        if ((before.showBounds ?? true) !== (after.showBounds ?? true)) {
            parts.push(
                after.showBounds === false
                    ? t('schemaChanges.boundsHidden')
                    : t('schemaChanges.boundsShown'),
            );
        }
    } else if (before.default !== after.default) {
        parts.push(describeDefaultChange(t, before.default, after.default));
    }
    if (before.type === 'select' && after.type === 'select') {
        const beforeValues = before.choices.map((c) => c.value);
        const afterValues = after.choices.map((c) => c.value);
        const gained = afterValues.filter((v) => !beforeValues.includes(v));
        const lost = beforeValues.filter((v) => !afterValues.includes(v));
        if (gained.length > 0)
            parts.push(
                t('schemaChanges.addsChoices', { choices: gained.join(', ') }),
            );
        if (lost.length > 0)
            parts.push(
                t('schemaChanges.dropsChoices', { choices: lost.join(', ') }),
            );
    }
    if (before.type === 'number' && after.type === 'number') {
        if (before.min !== after.min || before.max !== after.max)
            parts.push(t('schemaChanges.rangeChanged'));
    }
    if (before.label !== after.label)
        parts.push(t('schemaChanges.renamedFrom', { label: before.label }));
    return parts.join(', ');
};

const hierarchyChangeKind = (
    change: Exclude<DataAppVizHierarchyChange, 'unchanged'>,
): ChangeKind => {
    switch (change) {
        case 'added':
            return 'added';
        case 'changed':
            return 'updated';
        case 'removed':
            return 'removed';
        default:
            return assertUnreachable(change, 'Unknown hierarchy change');
    }
};

const toRows = (
    t: TFunction,
    changes: DataAppVizSchemaChanges,
): ChangeRow[] => [
    ...changes.fields.added.map((f) => ({
        key: `f+${f.name}`,
        kind: 'added' as const,
        icon: IconColumns,
        label: f.label,
        detail: describeField(t, f),
    })),
    ...changes.fields.changed.map((c) => ({
        key: `f~${c.after.name}`,
        kind: 'updated' as const,
        icon: IconColumns,
        label: c.after.label,
        detail: describeFieldChange(t, c),
    })),
    ...changes.fields.removed.map((f) => ({
        key: `f-${f.name}`,
        kind: 'removed' as const,
        icon: IconColumns,
        label: f.label,
        detail: describeField(t, f),
    })),
    ...changes.configOptions.added.map((o) => ({
        key: `o+${o.name}`,
        kind: 'added' as const,
        icon: IconAdjustmentsHorizontal,
        label: o.label,
        detail: t('schemaChanges.option', { type: o.type }),
    })),
    ...changes.configOptions.changed.map((c) => ({
        key: `o~${c.after.name}`,
        kind: 'updated' as const,
        icon: IconAdjustmentsHorizontal,
        label: c.after.label,
        detail: describeOptionChange(t, c),
    })),
    ...changes.configOptions.removed.map((o) => ({
        key: `o-${o.name}`,
        kind: 'removed' as const,
        icon: IconAdjustmentsHorizontal,
        label: o.label,
        detail: t('schemaChanges.option', { type: o.type }),
    })),
    ...(changes.colorPalette === 'unchanged'
        ? []
        : [
              {
                  key: 'palette',
                  kind: changes.colorPalette,
                  icon: IconPalette,
                  label: t('schemaChanges.colorPalette'),
                  detail: null,
              },
          ]),
    ...(changes.hierarchy === 'unchanged'
        ? []
        : [
              {
                  key: 'hierarchy',
                  kind: hierarchyChangeKind(changes.hierarchy),
                  icon: IconHierarchy,
                  label: t('schemaChanges.hierarchy'),
                  detail:
                      changes.hierarchy === 'changed'
                          ? t('schemaChanges.fieldChanged')
                          : null,
              },
          ]),
];

type Props = {
    changes: DataAppVizSchemaChanges;
    /** Denser type for narrow side panels. */
    compact?: boolean;
};

/**
 * The field, option, palette and hierarchy deltas between two chart type versions,
 * grouped the way field reviews are.
 */
const VizSchemaChangesList: FC<Props> = ({ changes, compact = false }) => {
    const { t } = useTranslation('chartTypes');
    const rows = toRows(t, changes);
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
                            {t(CHANGE_LABEL_KEY[group.kind])}
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
                                color="dimmed"
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

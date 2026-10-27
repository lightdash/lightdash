import {
    interpolateUiString,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Button, Group, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import classes from './ControlSidebar.module.css';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFilterRuleField } from './useFilterRuleField';
import { DEFAULT_ZOOM_NAME } from './zoomState';

// What the bar shows for a filter: its label, else its field's or column's name
const useFilterName = (rule: DashboardFilterRule | null): string | null => {
    const field = useFilterRuleField(rule);
    if (rule === null) return null;
    return (
        rule.label ??
        field?.label ??
        (rule.target.isSqlColumn ? rule.target.fieldId : null)
    );
};

type Props = {
    /** The edit cannot be kept yet: Apply (or Create) is disabled. */
    isApplyDisabled: boolean;
    /** Why it cannot be kept, in a dimmed line above the buttons; null for none. */
    hint: string | null;
};

// Cancel and Apply, or, after a click on another pill with changes unapplied,
// the question that pill asked
export const EditorFooter: FC<Props> = ({ isApplyDisabled, hint }) => {
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const pendingRule = useControlsSidebarSelector((c) => c.pendingRule);
    const pendingZoom = useControlsSidebarSelector((c) => c.pendingZoom);
    const resolvePending = useControlsSidebarSelector((c) => c.resolvePending);
    const discard = useControlsSidebarSelector((c) => c.discard);
    const close = useControlsSidebarSelector((c) => c.close);
    const getUiString = useUiStrings();
    const pendingFilterName = useFilterName(pendingRule);
    const isPending = pendingRule !== null || pendingZoom !== null;
    const pendingName =
        pendingZoom === null
            ? (pendingFilterName ?? getUiString('filters.rail.filterName'))
            : pendingZoom.name.trim() || DEFAULT_ZOOM_NAME;
    const applyLabel = getUiString(
        isNew ? 'filters.rail.create' : 'filters.apply',
    );
    // The same button in both states, so focus stays on it
    const apply = (
        <Button
            size="xs"
            className={classes.apply}
            data-controls-apply
            disabled={isApplyDisabled}
            onClick={isPending ? () => resolvePending(true) : close}
        >
            {applyLabel}
        </Button>
    );
    return (
        <Stack gap="xs" p="sm" className={classes.footer}>
            {isPending ? (
                <Text
                    fz="xs"
                    c="dimmed"
                    role="status"
                    className={classes.footerStatus}
                >
                    {interpolateUiString(
                        getUiString(
                            isNew
                                ? 'filters.rail.createBeforeOpening'
                                : 'filters.rail.applyBeforeOpening',
                        ),
                        { filter: pendingName },
                    )}
                </Text>
            ) : (
                hint !== null && (
                    <Text fz="xs" c="dimmed">
                        {hint}
                    </Text>
                )
            )}
            <Group justify="flex-end" gap="xs" wrap="nowrap">
                {isPending ? (
                    <Button
                        variant="default"
                        size="xs"
                        onClick={() => resolvePending(false)}
                    >
                        {getUiString('filters.rail.discard')}
                    </Button>
                ) : (
                    <Button variant="default" size="xs" onClick={discard}>
                        {getUiString('filters.actions.cancel')}
                    </Button>
                )}
                {apply}
            </Group>
        </Stack>
    );
};

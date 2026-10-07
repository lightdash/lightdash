import { Button, Group, Menu, Text, TextInput } from '@mantine/core';
import { useCallback, useId, useRef, useState, type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { EditorShell } from './EditorShell';
import { getFieldDisplayLabel } from './fieldGrains';
import { FieldsAndTiles } from './FieldsAndTiles';
import { useControlsSidebar } from './useControlsSidebar';

const LABEL_ERROR = 'Add a label so viewers know what this filters';

export const ControlSidebar: FC = () => {
    const {
        editing,
        isNew,
        isPlaceholder,
        editingRule,
        removeFilter,
        activeSection,
        setActiveSection,
        updateFilter,
        cancel,
        apply,
        isDirty,
    } = useControlsSidebar();
    const [removeArmed, setRemoveArmed] = useState(false);
    const [labelError, setLabelError] = useState(false);
    const [labelTouched, setLabelTouched] = useState(false);
    const labelInputRef = useRef<HTMLInputElement>(null);
    const labelErrorId = useId();
    const handleRemoveClick = useCallback(() => {
        if (removeArmed) {
            setRemoveArmed(false);
            removeFilter();
            return;
        }
        setRemoveArmed(true);
    }, [removeArmed, removeFilter]);
    const moreActions = (
        <Menu.Item color="red" onClick={handleRemoveClick}>
            {removeArmed ? 'Click again to remove' : 'Remove filter'}
        </Menu.Item>
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );

    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );

    if (editing === null || editingRule === null) return null;
    const filterRule = editingRule;

    const field = allFilterableFieldsMap[filterRule.target.fieldId] ?? null;
    const fieldLabel = field
        ? getFieldDisplayLabel(field, allFilterableFields ?? [])
        : null;
    const hasLabel = (filterRule.label ?? '').trim() !== '';
    const title = isNew
        ? isPlaceholder
            ? 'New control'
            : 'New filter'
        : filterRule.label || 'Filter';
    const needsLabel = isNew && !hasLabel;
    const blocker = isPlaceholder
        ? 'Add a field to apply'
        : needsLabel
          ? 'Add a label to apply'
          : null;
    const canApply = blocker === null;
    const footerStatus = blocker ?? (isDirty ? 'Not applied yet' : null);
    const showLabelError = () => {
        setLabelError(true);
        labelInputRef.current?.focus();
    };

    return (
        <EditorShell
            title={title}
            subtitle={isPlaceholder ? 'No mapping yet' : null}
            menu={isNew ? null : moreActions}
            onMenuClose={() => setRemoveArmed(false)}
            onCancel={cancel}
            tabs={[{ value: 'fields', label: 'Fields and tiles' }]}
            activeTab={activeSection}
            onTabChange={(value) => {
                if (value === 'fields' || value === 'settings')
                    setActiveSection(value);
            }}
            footerStatus={footerStatus}
            primaryLabel="Apply"
            primaryDisabled={!canApply}
            onPrimary={apply}
            aboveTabs={
                <>
                    <TextInput
                        ref={labelInputRef}
                        label={isPlaceholder ? 'Label' : 'Filter label'}
                        withAsterisk
                        required
                        aria-required
                        aria-describedby={labelError ? labelErrorId : undefined}
                        error={labelError ? LABEL_ERROR : undefined}
                        errorProps={{ id: labelErrorId }}
                        placeholder="What viewers will see"
                        value={filterRule.label ?? ''}
                        onChange={(event) => {
                            if (event.currentTarget.value.trim() !== '') {
                                setLabelError(false);
                            }
                            setLabelTouched(true);
                            updateFilter({
                                ...filterRule,
                                label: event.currentTarget.value || undefined,
                            });
                        }}
                        onBlur={() => {
                            if (labelTouched && !hasLabel) setLabelError(true);
                        }}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            if (canApply) apply();
                            else if (!hasLabel) showLabelError();
                        }}
                    />
                    {isNew && !hasLabel && fieldLabel !== null && (
                        <Group gap="xs">
                            <Text fz="xs" c="dimmed">
                                Suggestions
                            </Text>
                            <Button
                                size="compact-xs"
                                variant="default"
                                radius="xl"
                                onClick={() =>
                                    updateFilter({
                                        ...filterRule,
                                        label: fieldLabel,
                                    })
                                }
                            >
                                {fieldLabel}
                            </Button>
                        </Group>
                    )}
                </>
            }
        >
            <FieldsAndTiles />
        </EditorShell>
    );
};

import {
    resolveParameterDefault,
    type DashboardParameterControl,
    type ParameterDefinitions,
} from '@lightdash/common';
import { ActionIcon, Button, Text, Tooltip } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import Parameter from '../parameters/components/Parameter';
import { useDashboardControls, type ControlModel } from './context';
import { type ControlDraft } from './controlDraft';
import ControlKindSlot from './ControlKindSlot';
import { ControlPillPopover } from './ControlPopover';
import classes from './dashboardControls.module.css';
import { getControlLabel } from './parameterMapping';
import { useControlLabel } from './useControlLabel';

const NewControlPillButton: FC<{
    draft: ControlDraft;
    model: ControlModel;
}> = ({ draft, model }) => {
    const { togglePopover, isChoosing } = useDashboardControls();
    // Named after what it filters by as soon as that is chosen
    const label = useControlLabel({ draft, model });

    return (
        <ControlPillPopover isSelected>
            <Button
                data-dashboard-filter-control
                size="xs"
                variant="default"
                radius="xl"
                className={classes.editorPill}
                aria-pressed
                // No icon until its kind is known
                leftSection={
                    <ControlKindSlot
                        kind={isChoosing ? null : draft.kind}
                        isDraggable={false}
                    />
                }
                onClick={togglePopover}
            >
                <Text fz="xs" fw={600} truncate>
                    {label}
                </Text>
            </Button>
        </ControlPillPopover>
    );
};

// The control being added, until "Apply" puts it on the dashboard
export const NewControlPill: FC = () => {
    const { draft, model } = useDashboardControls();
    if (!draft?.isNew || !model) return null;
    return <NewControlPillButton draft={draft} model={model} />;
};

const formatValue = (value: unknown): string =>
    Array.isArray(value) ? value.join(', ') : String(value);

type EditPillProps = {
    control: DashboardParameterControl;
    definitions: ParameterDefinitions;
};

// Edit mode: the pill opens the control's popover instead of a value input
const ParameterControlEditPill: FC<EditPillProps> = ({
    control,
    definitions,
}) => {
    const { draft, selectedId, toggleParameter, removeParameterControl } =
        useDashboardControls();
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const isSelected = selectedId === control.id;
    // Another control is open: removing this one waits for it
    const isRemoveDisabled = draft !== null && !isSelected;

    const firstKey = control.parameterKeys[0];
    const definition =
        firstKey !== undefined ? definitions[firstKey] : undefined;
    const value =
        firstKey !== undefined
            ? (parameterValues[firstKey] ??
              (definition ? resolveParameterDefault(definition) : undefined))
            : undefined;

    return (
        <ControlPillPopover isSelected={isSelected}>
            <Button
                size="xs"
                variant="default"
                radius="xl"
                className={isSelected ? classes.editorPill : undefined}
                aria-pressed={isSelected}
                data-control-id={control.id}
                leftSection={
                    <ControlKindSlot kind="parameter" isDraggable={false} />
                }
                rightSection={
                    <Tooltip label="Remove" disabled={isRemoveDisabled}>
                        <ActionIcon
                            component="span"
                            size="xs"
                            radius="xl"
                            aria-label="Remove"
                            aria-disabled={isRemoveDisabled}
                            disabled={isRemoveDisabled}
                            onClick={(event) => {
                                event.stopPropagation();
                                if (isRemoveDisabled) return;
                                removeParameterControl(control.id);
                            }}
                        >
                            <MantineIcon size="sm" icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                }
                onClick={() => toggleParameter(control.id)}
            >
                <Text fz="xs" truncate>
                    <Text span fw={600}>
                        {getControlLabel(control, definitions)}
                    </Text>
                    {firstKey !== undefined && (
                        <>
                            <Text span c="dimmed">
                                {' is '}
                            </Text>
                            <Text span fw={500}>
                                {value === undefined
                                    ? 'any value'
                                    : formatValue(value)}
                            </Text>
                        </>
                    )}
                </Text>
            </Button>
        </ControlPillPopover>
    );
};

type Props = {
    isEditMode: boolean;
    // Parameters referenced by the tiles on the active tab
    activeTabParameters: ParameterDefinitions;
    missingRequiredParameters: string[];
};

// One pill per parameter control; parameters under no control have no pill
export const ParameterControlPills: FC<Props> = ({
    isEditMode,
    activeTabParameters,
    missingRequiredParameters,
}) => {
    const projectUuid = useProjectUuid();
    const {
        parameterControls,
        holdOpenControl,
        cancel,
        draftsTemporaryFilters,
    } = useDashboardControls();
    const definitions = useDashboardContext((c) => c.parameterDefinitions);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const setParameter = useDashboardContext((c) => c.setParameter);
    const [openPopoverId, setOpenPopoverId] = useState<string>();
    const closePopover = useCallback(() => setOpenPopoverId(undefined), []);

    // Viewers see a control on the tabs whose charts use one of its parameters
    const viewControls = useMemo(
        () =>
            parameterControls.flatMap((control) => {
                const key =
                    control.parameterKeys.find(
                        (k) => activeTabParameters[k] !== undefined,
                    ) ?? null;
                return key === null ? [] : [{ control, key }];
            }),
        [parameterControls, activeTabParameters],
    );

    if (isEditMode) {
        return (
            <>
                {parameterControls.map((control) => (
                    <ParameterControlEditPill
                        key={control.id}
                        control={control}
                        definitions={definitions}
                    />
                ))}
            </>
        );
    }

    return (
        <>
            {viewControls.map(({ control, key }) => (
                <Parameter
                    key={control.id}
                    paramKey={key}
                    parameter={{
                        ...activeTabParameters[key],
                        label: getControlLabel(control, definitions),
                    }}
                    value={parameterValues[key] ?? null}
                    parameterValues={parameterValues}
                    // The compact drawer keeps today's pill
                    kindSlot={
                        draftsTemporaryFilters ? (
                            <ControlKindSlot
                                kind="parameter"
                                isDraggable={false}
                            />
                        ) : undefined
                    }
                    openPopoverId={openPopoverId}
                    // One popover at a time: an open control with changes
                    // stays, one without gives way
                    onPopoverOpen={(popoverId) => {
                        if (holdOpenControl()) return;
                        cancel();
                        setOpenPopoverId(popoverId);
                    }}
                    onPopoverClose={closePopover}
                    // The control's value is written under every one of its parameters
                    onParameterChange={(_key, value) =>
                        control.parameterKeys.forEach((k) =>
                            setParameter(k, value),
                        )
                    }
                    projectUuid={projectUuid}
                    isRequired={control.parameterKeys.some((k) =>
                        missingRequiredParameters.includes(k),
                    )}
                />
            ))}
        </>
    );
};

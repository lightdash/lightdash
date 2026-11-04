import {
    type DashboardFilterableField,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { Button, Menu, Paper, Stack } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    AddKindItems,
    FieldPicker,
    ParameterPicker,
} from '../../features/dashboardControls/ControlPickers';
import { focusStartOnMount } from '../../features/dashboardControls/editorFocus';
import { type ParameterOption } from './parameterOptions';

type Step = 'closed' | 'choose' | 'filter' | 'parameter';

type Props = {
    fields: DashboardFilterableField[];
    tabs: DashboardTab[];
    tiles: DashboardTile[];
    /** The fields each tile can be filtered by: a field's tile count. */
    availableTileFilters: Record<string, DashboardFilterableField[]>;
    /** One row per parameter, never combined; empty leaves filters only. */
    parameters: ParameterOption[];
    /** Viewers add filters only: "Add filter", straight to the field picker. */
    isViewer: boolean;
    onPickField: (field: DashboardFilterableField) => void;
    onPickParameter: (parameter: ParameterOption) => void;
};

// "Add" as the bar's `AddControl` lays it out, with the shipped choice and
// pickers, opened in place of the bar's popovers. Opens with the choice showing
export const AddControlMenu: FC<Props> = ({
    fields,
    tabs,
    tiles,
    availableTileFilters,
    parameters,
    isViewer,
    onPickField,
    onPickParameter,
}) => {
    const getUiString = useUiStrings();
    // Filters only (a viewer, or no tile uses a parameter): no choice to make
    const isFilterOnly = isViewer || parameters.length === 0;
    const [step, setStep] = useState<Step>(isFilterOnly ? 'filter' : 'choose');
    const backToChoice = () => setStep('choose');

    const panel =
        step === 'filter' ? (
            <FieldPicker
                fields={fields}
                tabs={tabs}
                tiles={tiles}
                activeTabUuid={tabs[0]?.uuid}
                availableTileFilters={availableTileFilters}
                onBack={isFilterOnly ? null : backToChoice}
                withinPortal={false}
                onPick={onPickField}
            />
        ) : step === 'parameter' ? (
            <ParameterPicker
                parameters={parameters}
                onBack={backToChoice}
                withinPortal={false}
                onPick={onPickParameter}
            />
        ) : null;

    return (
        <Stack gap="xs" align="flex-start">
            {isFilterOnly ? (
                <Button
                    variant="default"
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={() => setStep('filter')}
                >
                    {getUiString('filters.addFilter')}
                </Button>
            ) : (
                <Menu
                    position="bottom-start"
                    width={280}
                    opened={step === 'choose'}
                    returnFocus={step === 'closed'}
                    onChange={(opened) =>
                        setStep((current) =>
                            opened
                                ? 'choose'
                                : current === 'choose'
                                  ? 'closed'
                                  : current,
                        )
                    }
                >
                    <Menu.Target>
                        <Button
                            variant="default"
                            size="xs"
                            leftSection={<MantineIcon icon={IconPlus} />}
                        >
                            {getUiString('controls.add')}
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <AddKindItems
                            onFilter={() => setStep('filter')}
                            onParameter={() => setStep('parameter')}
                        />
                    </Menu.Dropdown>
                </Menu>
            )}
            {panel !== null && (
                <Paper
                    key={step}
                    shadow="md"
                    radius="md"
                    p="sm"
                    w="min(400px, calc(100vw - 56px))"
                    ref={focusStartOnMount}
                >
                    {panel}
                </Paper>
            )}
        </Stack>
    );
};

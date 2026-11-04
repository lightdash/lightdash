import {
    assertUnreachable,
    createDashboardFilterRuleFromField,
    getItemId,
    type DashboardFilterableField,
} from '@lightdash/common';
import { useState, type FC } from 'react';
import { action } from 'storybook/actions';
import { AddControlMenu } from './AddControlMenu';
import {
    availableTileFilters,
    createParameterControl,
    fields,
    ON_BAR_PARAMETER_KEYS,
    parameterList,
    tabs,
    tiles,
} from './fixtures';
import { type ParameterOption } from './parameterOptions';
import {
    StatefulFilterPopover,
    StatefulParameterPopover,
} from './StatefulPopovers';

// The tiles a new filter reaches: those that can filter by its field, as the
// picker counts them
const getFieldTileCount = (field: DashboardFilterableField) =>
    Object.values(availableTileFilters).filter((tileFields) =>
        tileFields.some(
            (candidate) => getItemId(candidate) === getItemId(field),
        ),
    ).length;

type Step =
    | { step: 'menu' }
    | { step: 'field'; field: DashboardFilterableField }
    | { step: 'parameter'; parameter: ParameterOption };

/** "Add", then a field's filter or a parameter's control; Cancel goes back to
 * the Add menu, its choice open again. */
export const AddControlFlow: FC = () => {
    const [flow, setFlow] = useState<Step>({ step: 'menu' });
    const backToMenu = () => setFlow({ step: 'menu' });
    switch (flow.step) {
        case 'menu':
            return (
                <AddControlMenu
                    fields={Object.values(fields)}
                    tabs={tabs}
                    tiles={tiles}
                    availableTileFilters={availableTileFilters}
                    parameters={parameterList}
                    isViewer={false}
                    onPickField={(field) => setFlow({ step: 'field', field })}
                    onPickParameter={(parameter) =>
                        setFlow({ step: 'parameter', parameter })
                    }
                />
            );
        case 'field':
            return (
                <StatefulFilterPopover
                    initialRule={createDashboardFilterRuleFromField({
                        field: flow.field,
                        availableTileFilters,
                        isTemporary: false,
                    })}
                    field={flow.field}
                    isViewer={false}
                    isOwnFilter={false}
                    isCreatingNew={false}
                    canManageExplore
                    appliedTileCount={getFieldTileCount(flow.field)}
                    isAsking={false}
                    initialView="value"
                    onApply={action('onApply')}
                    onCancel={backToMenu}
                    onChooseTiles={action('onChooseTiles')}
                    onEditRules={action('onEditRules')}
                    onChangeOthers={action('onChangeOthers')}
                    onDraftChange={action('onDraftChange')}
                />
            );
        case 'parameter':
            return (
                <StatefulParameterPopover
                    initialControl={createParameterControl(
                        [flow.parameter],
                        null,
                        // A second control on a parameter starts with no tiles
                        ON_BAR_PARAMETER_KEYS.includes(flow.parameter.key)
                            ? []
                            : flow.parameter.tileUuids,
                    )}
                    isViewer={false}
                    isMissingRequired={false}
                    initialView="value"
                    shadowedReservedNames={[]}
                    onApply={action('onApply')}
                    onCancel={backToMenu}
                    onChooseTiles={action('onChooseTiles')}
                />
            );
        default:
            return assertUnreachable(flow, 'Unknown add step');
    }
};

import { Button, FormGroup, HTMLSelect } from '@blueprintjs/core';
import {
    CompiledField,
    ConditionalFormattingConfig,
    ConditionalFormattingRule,
    createConditionalFormatingRule,
    fieldId,
    FilterOperator,
    FilterType,
    getItemId,
    getVisibleFields,
} from '@lightdash/common';
import produce from 'immer';
import { FC, useEffect, useMemo, useState } from 'react';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import ColorInput from '../common/ColorInput';
import { FilterTypeConfig } from '../common/Filters/configs';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import { FiltersProvider } from '../common/Filters/FiltersProvider';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';

const ConditionalFormatting: FC = () => {
    const {
        explore,
        tableConfig: { conditionalFormattings, onSetConditionalFormattings },
    } = useVisualizationContext();

    const activeFields = useExplorerContext((c) => c.state.activeFields);
    const visibleActiveNumericFields = useMemo(() => {
        return explore
            ? getVisibleFields(explore)
                  .filter((field) => activeFields.has(fieldId(field)))
                  .filter((field) => field.type === 'number')
            : [];
    }, [explore, activeFields]);

    // TODO: this is intentional to support multiple conditional formattings
    const value = conditionalFormattings[0];
    const field = useMemo(
        () =>
            visibleActiveNumericFields.find(
                (f) => getItemId(f) === value?.target?.fieldId,
            ),
        [],
    );

    const [config, setConfig] = useState<ConditionalFormattingConfig | null>(
        value,
    );

    const handleAddEmptyConditionalFormatting = () => {
        setConfig({
            target: null,
            color: '#000000',
            rules: [createConditionalFormatingRule()],
        });
    };

    const handleRemoveConditionalFormatting = () => {
        setConfig(null);
    };

    const handleChangeField = (newField: CompiledField | undefined) => {
        if (!config) return;

        setConfig({
            ...config,
            target: newField ? { fieldId: getItemId(newField) } : null,
        });
    };

    const handleChangeFilterOperator = (newOperator: FilterOperator) => {
        if (!config) return;

        setConfig(
            produce(config, (draft) => {
                draft.rules[0].operator = newOperator;
            }),
        );
    };

    const handleChangeRule = (newRule: ConditionalFormattingRule) => {
        if (!config) return;

        setConfig(
            produce(config, (draft) => {
                draft.rules[0] = newRule;
                return draft;
            }),
        );
    };

    const handleChangeColor = (newColor: string) => {
        if (!config) return;
        setConfig({ ...config, color: newColor });
    };

    useEffect(() => {
        onSetConditionalFormattings(config ? [config] : []);
    }, [config, onSetConditionalFormattings]);

    // conditional formatting only supports number fields for now
    const filterConfig = FilterTypeConfig[FilterType.NUMBER];

    // TODO: remove nonsense props
    return (
        <FiltersProvider projectUuid="BLAH." fieldsMap={{}}>
            {!config ? (
                <FormGroup>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <Button
                            icon="plus"
                            onClick={handleAddEmptyConditionalFormatting}
                        >
                            Add conditional formatting
                        </Button>
                    </div>
                </FormGroup>
            ) : (
                <>
                    <FormGroup label="Select field">
                        <FieldAutoComplete
                            id="numeric-field-autocomplete"
                            fields={visibleActiveNumericFields}
                            activeField={field}
                            onChange={handleChangeField}
                            popoverProps={{
                                lazy: true,
                                matchTargetWidth: true,
                            }}
                            inputProps={{
                                rightElement: (
                                    <Button
                                        minimal
                                        icon="cross"
                                        onClick={() =>
                                            handleChangeField(undefined)
                                        }
                                    />
                                ),
                            }}
                        />
                    </FormGroup>

                    {config.rules.map((rule, index) => (
                        <div key={index}>
                            <FormGroup label="Set color">
                                <ColorInput
                                    placeholder="Enter hex color"
                                    value={config.color}
                                    onChange={(e) =>
                                        handleChangeColor(e.target.value)
                                    }
                                />
                            </FormGroup>

                            <FormGroup label="Value">
                                <HTMLSelect
                                    fill
                                    onChange={(e) =>
                                        handleChangeFilterOperator(
                                            e.target.value as FilterOperator,
                                        )
                                    }
                                    options={filterConfig.operatorOptions}
                                    value={rule.operator}
                                />
                            </FormGroup>

                            <FormGroup>
                                <filterConfig.inputs
                                    filterType={FilterType.NUMBER}
                                    field={
                                        field ?? visibleActiveNumericFields[0]
                                    }
                                    rule={rule}
                                    onChange={handleChangeRule}
                                />
                            </FormGroup>

                            <FormGroup>
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Button
                                        icon="cross"
                                        onClick={
                                            handleRemoveConditionalFormatting
                                        }
                                    >
                                        Remove conditional formatting
                                    </Button>
                                </div>
                            </FormGroup>
                        </div>
                    ))}
                </>
            )}
        </FiltersProvider>
    );
};
export default ConditionalFormatting;

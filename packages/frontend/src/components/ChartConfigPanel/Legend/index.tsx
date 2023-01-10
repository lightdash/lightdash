import { Collapse, Switch } from '@blueprintjs/core';
import {
    CompiledDimension,
    EchartsLegend,
    friendlyName,
    TableCalculation,
} from '@lightdash/common';
import startCase from 'lodash-es/startCase';
import React, { FC } from 'react';
import { Field, useForm } from 'react-hook-form';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import Checkbox from '../../ReactHookForm/Checkbox';
import Form from '../../ReactHookForm/Form';
import Select from '../../ReactHookForm/Select';
import UnitInput from '../../ReactHookForm/UnitInput';
import { SectionRow, SectionTitle } from './Legend.styles';
import { ReferenceLines } from './ReferenceLines';

const triggerSubmitFields = ['show', 'orient'];

enum Positions {
    Left = 'left',
    Right = 'right',
    Top = 'top',
    Bottom = 'bottom',
}

enum Units {
    Pixels = 'px',
    Percentage = '%',
}

const units = Object.values(Units);
type Props = {
    items: (Field | TableCalculation | CompiledDimension)[];
};
const LegendPanel: FC<Props> = ({ items }) => {
    const {
        cartesianConfig: { dirtyEchartsConfig, setLegend },
    } = useVisualizationContext();
    const methods = useForm<EchartsLegend>({
        mode: 'onBlur',
        defaultValues: dirtyEchartsConfig?.legend,
    });
    const { watch, handleSubmit } = methods;

    React.useEffect(() => {
        const subscription = watch((value, { name }) => {
            if (name && triggerSubmitFields.includes(name)) {
                setLegend(value);
            }
        });
        return () => subscription.unsubscribe();
    }, [handleSubmit, setLegend, watch]);

    const showDefault = (dirtyEchartsConfig?.series || []).length > 1;
    return (
        <Form
            name="legend"
            methods={methods}
            onSubmit={() => undefined}
            onBlur={handleSubmit(setLegend)}
        >
            <Checkbox
                name="show"
                checkboxProps={{ label: 'Show legend' }}
                defaultValue={showDefault}
            />

            <Collapse
                isOpen={
                    dirtyEchartsConfig?.legend
                        ? dirtyEchartsConfig?.legend.show
                        : showDefault
                }
            >
                <SectionTitle>Scroll</SectionTitle>
                <Switch
                    large
                    checked={dirtyEchartsConfig?.legend?.type !== 'plain'}
                    onChange={() => {
                        const type: 'scroll' | 'plain' =
                            dirtyEchartsConfig?.legend?.type !== 'plain'
                                ? 'plain'
                                : 'scroll';
                        methods.setValue('type', type);
                        handleSubmit(setLegend)();
                    }}
                />
                <SectionTitle>Position</SectionTitle>

                {[
                    [Positions.Left, Positions.Right],
                    [Positions.Top, Positions.Bottom],
                ].map((positionGroup) => (
                    <SectionRow key={positionGroup.join(',')}>
                        {positionGroup.map((position) => (
                            <UnitInput
                                key={position}
                                label={startCase(position)}
                                name={position}
                                units={units}
                                defaultValue="auto"
                            />
                        ))}
                    </SectionRow>
                ))}

                <SectionTitle>Orientation</SectionTitle>
                <SectionRow>
                    <Select
                        name="orient"
                        options={['horizontal', 'vertical'].map((x) => ({
                            value: x,
                            label: friendlyName(x),
                        }))}
                        defaultValue="horizontal"
                    />
                </SectionRow>
            </Collapse>
            <ReferenceLines items={items} />
        </Form>
    );
};

export default LegendPanel;

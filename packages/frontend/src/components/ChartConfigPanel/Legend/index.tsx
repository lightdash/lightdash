import { Collapse } from '@blueprintjs/core';
import { EchartsLegend, friendlyName } from '@lightdash/common';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import BooleanSwitch from '../../ReactHookForm/BooleanSwitch';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import Select from '../../ReactHookForm/Select';
import { SectionRow, SectionTitle } from './Legend.styles';

const triggerSubmitFields = ['show', 'type', 'orient'];

const LegendPanel: FC = () => {
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
            <BooleanSwitch
                name="show"
                label="Show legend"
                defaultValue={showDefault}
            />
            <Collapse
                isOpen={
                    dirtyEchartsConfig?.legend
                        ? dirtyEchartsConfig?.legend.show
                        : showDefault
                }
            >
                <SectionTitle>Position</SectionTitle>
                <SectionRow>
                    <Input name="top" label="Top" placeholder={'auto'} />
                    <Input name="bottom" label="Bottom" placeholder={'auto'} />
                    <Input name="left" label="Left" placeholder={'auto'} />
                    <Input name="right" label="Right" placeholder={'auto'} />
                </SectionRow>
                <SectionTitle>Appearance</SectionTitle>
                <SectionRow>
                    <Select
                        name="type"
                        label="Type"
                        options={['plain', 'scroll'].map((x) => ({
                            value: x,
                            label: friendlyName(x),
                        }))}
                        defaultValue="plain"
                    />
                    <Select
                        name="orient"
                        label="Orientation"
                        options={['horizontal', 'vertical'].map((x) => ({
                            value: x,
                            label: friendlyName(x),
                        }))}
                        defaultValue="horizontal"
                    />
                </SectionRow>
            </Collapse>
        </Form>
    );
};

export default LegendPanel;

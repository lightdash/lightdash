import { Collapse, Switch } from '@blueprintjs/core';
import { EchartsLegend, friendlyName } from '@lightdash/common';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import Checkbox from '../../ReactHookForm/Checkbox';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import Select from '../../ReactHookForm/Select';
import { InputTitle, SectionRow, SectionTitle } from './Legend.styles';

const triggerSubmitFields = ['show', 'orient', 'scroll'];

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
                <InputTitle>Scroll</InputTitle>
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
                <SectionRow>
                    <Input name="top" label="Top" placeholder={'auto'} />
                    <Input name="bottom" label="Bottom" placeholder={'auto'} />
                    <Input name="left" label="Left" placeholder={'auto'} />
                    <Input name="right" label="Right" placeholder={'auto'} />
                </SectionRow>
                <SectionTitle>Appearance</SectionTitle>
                <SectionRow>
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

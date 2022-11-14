import { EchartsGrid } from '@lightdash/common';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import { SectionRow, SectionTitle } from './Grid.styles';

export const defaultGrid: EchartsGrid = {
    containLabel: true,
    left: '5%', // small padding
    right: '5%', // small padding
    top: '70', // pixels from top (makes room for legend)
    bottom: '30', // pixels from bottom (makes room for x-axis)
};

const GridPanel: FC = () => {
    const {
        cartesianConfig: { dirtyEchartsConfig, setGrid },
    } = useVisualizationContext();
    const methods = useForm<EchartsGrid>({
        mode: 'onBlur',
        defaultValues: { ...defaultGrid, ...dirtyEchartsConfig?.grid },
    });

    return (
        <Form
            name="grid"
            methods={methods}
            onSubmit={() => undefined}
            onBlur={methods.handleSubmit(setGrid)}
        >
            <SectionTitle>(px or %)</SectionTitle>
            <SectionRow>
                <Input name="top" label="Top" placeholder={defaultGrid.top} />
                <Input
                    name="bottom"
                    label="Bottom"
                    placeholder={defaultGrid.bottom}
                />
                <Input
                    name="left"
                    label="Left"
                    placeholder={defaultGrid.left}
                />
                <Input
                    name="right"
                    label="Right"
                    placeholder={defaultGrid.right}
                />
            </SectionRow>
        </Form>
    );
};

export default GridPanel;

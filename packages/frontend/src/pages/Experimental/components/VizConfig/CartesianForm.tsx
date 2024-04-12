import { Group, MultiSelect, Select } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form/lib/types';
import { type CartiseanConfigDto } from '../../Dto/VizConfigDto/CartiseanConfigDto';

type VizConfigArguments = {
    vizDto: CartiseanConfigDto;
    form: UseFormReturnType<any>;
};
const CartiseanConfig = ({ form, vizDto }: VizConfigArguments) => {
    return (
        <Group>
            <Select
                label="X axis"
                placeholder="Pick one"
                data={vizDto.getXAxisOptions()}
                {...form.getInputProps('xField')}
            />
            <MultiSelect
                label="Y axis"
                placeholder="Pick one"
                data={vizDto.getYAxisOptions()}
                {...form.getInputProps('yFields')}
            />
            {vizDto.canPivot() && (
                <MultiSelect
                    label="Pivot fields"
                    placeholder="Pick one"
                    data={vizDto.getPivotOptions()}
                    {...form.getInputProps('pivotFields')}
                />
            )}
        </Group>
    );
};

export default CartiseanConfig;

import { Button, Group, MultiSelect, Select } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type VizConfiguration } from '../../types';

type VizConfigArguments = {
    value: VizConfiguration | undefined;
    onChange: (value: VizConfiguration) => void;
    libOptions: string[];
    vizOptions: string[];
    xAxisOptions: string[];
    yAxisOptions: string[];
    pivotOptions: string[];
};
const VizConfig = ({
    value,
    onChange,
    libOptions,
    vizOptions,
    xAxisOptions,
    yAxisOptions,
    pivotOptions,
}: VizConfigArguments) => {
    const form = useForm({
        initialValues: value,
    });
    return (
        <form onSubmit={form.onSubmit(onChange)}>
            <Group>
                <Select
                    label="Your favorite framework/library"
                    placeholder="Pick one"
                    data={libOptions}
                    disabled={libOptions.length === 0}
                    {...form.getInputProps('libType')}
                />
                <Select
                    label="Your favorite type of chart"
                    placeholder="Pick one"
                    data={vizOptions}
                    disabled={vizOptions.length === 0}
                    {...form.getInputProps('vizType')}
                />
                <Select
                    label="X axis"
                    placeholder="Pick one"
                    data={xAxisOptions}
                    disabled={vizOptions.length === 0}
                    {...form.getInputProps('xField')}
                />
                <MultiSelect
                    label="Y axis"
                    placeholder="Pick one"
                    data={yAxisOptions}
                    disabled={vizOptions.length === 0}
                    {...form.getInputProps('yFields')}
                />
                <MultiSelect
                    label="Pivot fields"
                    placeholder="Pick one"
                    data={pivotOptions}
                    disabled={vizOptions.length === 0}
                    {...form.getInputProps('pivotFields')}
                />
                <Button type="submit" sx={{ alignSelf: 'flex-end' }}>
                    Apply
                </Button>
            </Group>
        </form>
    );
};

export default VizConfig;

import { Group } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type CartiseanConfigDto } from '../../Dto/VizConfigDto/CartiseanConfigDto';
import { type VizConfigDto } from '../../Dto/VizConfigDto/VizConfigDto';
import type { VizConfiguration } from '../../types';
import CartiseanConfig from './CartesianForm';

type VizConfigArguments = {
    vizDto: VizConfigDto;
    onChange: (value: VizConfiguration) => void;
};
const ConfigForm = ({ vizDto, onChange }: VizConfigArguments) => {
    const form = useForm({
        initialValues: vizDto.getVizConfig(),
    });
    return (
        <form
            onSubmit={form.onSubmit((values) =>
                onChange({
                    ...values,
                    libType: vizDto.getVizConfig().libType,
                    vizType: vizDto.getVizConfig().vizType,
                }),
            )}
        >
            <Group>
                {(vizDto.getVizConfig().vizType === 'bar' ||
                    vizDto.getVizConfig().vizType === 'line') && (
                    <CartiseanConfig
                        vizDto={vizDto as CartiseanConfigDto}
                        form={form}
                    />
                )}
            </Group>
        </form>
    );
};

export default ConfigForm;

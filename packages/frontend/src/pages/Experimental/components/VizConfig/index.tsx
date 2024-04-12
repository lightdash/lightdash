import { Button, Group } from '@mantine/core';
import VizConfigDtoFactory from '../../Dto/VizConfigDto';
import { type VizConfigDto } from '../../Dto/VizConfigDto/VizConfigDto';
import { type VizConfiguration } from '../../types';

type VizConfigArguments = {
    vizDto: VizConfigDto;
    onChange: (value: VizConfiguration) => void;
};
const VizConfig = ({ vizDto, onChange }: VizConfigArguments) => {
    return (
        <Group>
            {VizConfigDtoFactory.listVizConfigs().map((viz) => (
                <Button
                    key={viz}
                    variant={
                        viz === vizDto.getVizConfig().vizType
                            ? 'filled'
                            : 'outline'
                    }
                    size="xs"
                    onClick={() =>
                        onChange({ ...vizDto.getVizConfig(), vizType: viz })
                    }
                >
                    {viz}
                </Button>
            ))}
        </Group>
    );
};

export default VizConfig;

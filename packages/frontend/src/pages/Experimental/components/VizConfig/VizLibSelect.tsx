import { Button, Group } from '@mantine/core';
import { type VizConfigDto } from '../../Dto/VizConfigDto/VizConfigDto';
import VizLibDtoFactory from '../../Dto/VizLibDto';
import { type VizConfiguration } from '../../types';

type VizConfigArguments = {
    vizDto: VizConfigDto;
    onChange: (value: VizConfiguration) => void;
};
const VizLibSelect = ({ vizDto, onChange }: VizConfigArguments) => {
    return (
        <Group>
            {VizLibDtoFactory.listVizLibs(vizDto.getVizConfig().vizType).map(
                (lib) => (
                    <Button
                        key={lib}
                        variant={
                            lib === vizDto.getVizConfig().libType
                                ? 'filled'
                                : 'outline'
                        }
                        size="xs"
                        onClick={() =>
                            onChange({ ...vizDto.getVizConfig(), libType: lib })
                        }
                    >
                        {lib}
                    </Button>
                ),
            )}
        </Group>
    );
};

export default VizLibSelect;

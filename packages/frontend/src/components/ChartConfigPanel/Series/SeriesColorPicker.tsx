import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { ActionIcon, Center, Popover } from '@mantine/core';
import { IconDropletFilled } from '@tabler/icons-react';
import { FC } from 'react';
import { BlockPicker, ColorResult } from 'react-color';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    color?: string;
    onChange: (value: string) => void;
};

const SeriesColorPicker: FC<Props> = ({ color, onChange }) => {
    const { data } = useOrganization();

    const colors = data?.chartColors || ECHARTS_DEFAULT_COLORS;
    return (
        <Popover
            closeOnClickOutside
            width="auto"
            position="bottom"
            withArrow
            shadow="sm"
        >
            <Popover.Target>
                <ActionIcon
                    bg={color}
                    sx={{
                        ':hover': {
                            backgroundColor: color,
                        },
                    }}
                >
                    <Center>
                        {!color && (
                            <MantineIcon
                                size={16}
                                color="gray.5"
                                icon={IconDropletFilled}
                            />
                        )}
                    </Center>
                </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
                <BlockPicker
                    triangle="hide"
                    color={color}
                    colors={colors}
                    styles={{
                        default: {
                            card: {
                                boxShadow: 'none',
                            },
                        },
                    }}
                    onChange={(result: ColorResult) => {
                        onChange(result.hex);
                    }}
                />
            </Popover.Dropdown>
        </Popover>
    );
};

export default SeriesColorPicker;

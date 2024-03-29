import type { EchartsGrid, EchartsLegend } from '@lightdash/common';
import { Badge, Center, Flex, SimpleGrid } from '@mantine/core';
import { type FC } from 'react';
import UnitInput from '../../../common/UnitInput';

enum Positions {
    Top = 'top',
    Left = 'left',
    Right = 'right',
    Bottom = 'bottom',
}

enum Units {
    Pixels = 'px',
    Percentage = '%',
}

const units = Object.values(Units);

type Props = {
    config:
        | ({
              containLabel: boolean;
              top: string;
              right: string;
              bottom: string;
              left: string;
          } & Pick<EchartsGrid, 'width' | 'height'>)
        | EchartsLegend;
    onChange: (position: Positions, newValue: string) => void;
    centerLabel: string;
    defaultConfig: {
        top: string;
        left: string;
        right: string;
        bottom: string;
    };
};

const EmptySpace = () => <div></div>;

export const UnitInputsGrid: FC<Props> = ({
    config,
    onChange,
    centerLabel,
    defaultConfig,
}) => {
    const handleUpdate = (
        position: Positions,
        newValue: string | undefined,
    ) => {
        if (newValue) onChange(position, newValue);
    };

    return (
        <SimpleGrid
            cols={3}
            spacing="xs"
            py="xs"
            sx={{
                border: '1px solid #E6E6E6',
                borderRadius: '4px',
                backgroundColor: '#fafafa',
            }}
        >
            {/* Row 1 */}
            <EmptySpace />
            <Flex justify="center" align="end">
                <UnitInput
                    key="top"
                    size="xs"
                    w={80}
                    name="top"
                    units={units}
                    value={config.top || defaultConfig.top}
                    defaultValue={defaultConfig.top}
                    onChange={(value) => handleUpdate(Positions.Top, value)}
                />
            </Flex>
            <EmptySpace />
            {/* Row 2 */}
            <Flex justify="end" align="start">
                <UnitInput
                    key="left"
                    size="xs"
                    w={80}
                    name="left"
                    units={units}
                    value={config.left || defaultConfig.left}
                    defaultValue={defaultConfig.left}
                    onChange={(value) => handleUpdate(Positions.Left, value)}
                />
            </Flex>

            <Center px="xs" py="one">
                <Badge color="blue" radius={'xs'} fullWidth h="100%">
                    {centerLabel}
                </Badge>
            </Center>
            <Flex justify="start" align="center">
                <UnitInput
                    key="right"
                    size="xs"
                    w={80}
                    name="right"
                    units={units}
                    value={config.right || defaultConfig.right}
                    defaultValue={defaultConfig.right}
                    onChange={(value) => handleUpdate(Positions.Right, value)}
                />
            </Flex>
            {/* Row 3 */}
            <EmptySpace />
            <Flex justify="center" align="start">
                <UnitInput
                    key="bottom"
                    size="xs"
                    w={80}
                    name="bottom"
                    units={units}
                    value={config.bottom || defaultConfig.bottom}
                    defaultValue={defaultConfig.bottom}
                    onChange={(value) => handleUpdate(Positions.Bottom, value)}
                />
            </Flex>
            <EmptySpace />
        </SimpleGrid>
    );
};

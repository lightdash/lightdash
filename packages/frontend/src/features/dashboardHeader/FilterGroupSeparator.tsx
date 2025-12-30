import { Center, Tooltip } from '@mantine-8/core';
import { type Icon } from '@tabler/icons-react';
import { type FC, type JSX } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

type Props = {
    icon: Icon;
    tooltipLabel?: JSX.Element;
    size?: 'md' | 'sm';
};

const FilterGroupSeparator: FC<Props> = ({
    icon,
    tooltipLabel,
    size = 'md',
}) => {
    return (
        <Tooltip disabled={!tooltipLabel} label={tooltipLabel}>
            <Center
                w={size === 'md' ? 30 : 24}
                h={size === 'md' ? 30 : 24}
                flex="0 0 auto"
                bg="ldGray.1"
                style={{ borderRadius: '100%' }}
            >
                <MantineIcon
                    icon={icon}
                    color="ldGray.6"
                    size={size === 'md' ? undefined : 16}
                />
            </Center>
        </Tooltip>
    );
};

export default FilterGroupSeparator;

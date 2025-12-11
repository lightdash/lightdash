import { Center, Tooltip } from '@mantine-8/core';
import { type Icon } from '@tabler/icons-react';
import { type FC, type JSX } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

type Props = {
    icon: Icon;
    tooltipLabel: JSX.Element;
};

const FilterGroupSeparator: FC<Props> = ({ icon, tooltipLabel }) => {
    return (
        <Tooltip label={tooltipLabel}>
            <Center
                w={30}
                h={30}
                flex="0 0 auto"
                bg="ldGray.1"
                style={{ borderRadius: '100%' }}
            >
                <MantineIcon icon={icon} color="ldGray.6" />
            </Center>
        </Tooltip>
    );
};

export default FilterGroupSeparator;

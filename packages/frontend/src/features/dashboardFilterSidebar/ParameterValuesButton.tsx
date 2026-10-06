import { Button } from '@mantine/core';
import { IconVariable } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useFilterSidebar } from './useFilterSidebar';

export const ParameterValuesButton: FC = () => {
    const { openParameters } = useFilterSidebar();
    return (
        <Button
            variant="default"
            size="xs"
            leftSection={<MantineIcon icon={IconVariable} />}
            onClick={openParameters}
        >
            Parameter values
        </Button>
    );
};

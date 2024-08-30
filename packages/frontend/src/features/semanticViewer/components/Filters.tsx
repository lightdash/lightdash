import { Box } from '@mantine/core';
import { useState, type FC } from 'react';
import { useAppSelector } from '../store/hooks';
import BadgeButton from './BadgeButton';
import FiltersModal from './FiltersModal';

const Filters: FC = () => {
    const [filtersModalOpened, setFiltersModalOpened] = useState(false);
    const { filters } = useAppSelector((state) => state.semanticViewer);

    // TODO: This will need to take into account nested filters
    const filtersCount = Object.keys(filters).length;

    return (
        <Box pos="relative">
            <BadgeButton
                variant="filled"
                onClick={() => setFiltersModalOpened(true)}
            >
                Filters ({filtersCount})
            </BadgeButton>
            <FiltersModal
                size="xl"
                pos="absolute"
                top={0}
                left={0}
                opened={filtersModalOpened}
                onClose={() => setFiltersModalOpened(false)}
                withCloseButton={false}
            />
        </Box>
    );
};

export default Filters;

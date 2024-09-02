import { Box } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import { useAppSelector } from '../store/hooks';
import BadgeButton from './BadgeButton';
import FiltersModal from './FiltersModal';

const Filters: FC = () => {
    const [filtersModalOpened, setFiltersModalOpened] = useState(false);
    const { filters } = useAppSelector((state) => state.semanticViewer);
    const filtersCount = useMemo(() => Object.keys(filters).length, [filters]);

    return (
        <Box>
            <BadgeButton
                variant="outline"
                onClick={() => setFiltersModalOpened(true)}
            >
                Filters {filtersCount > 0 && `(${filtersCount})`}
            </BadgeButton>
            <FiltersModal
                size="xl"
                opened={filtersModalOpened}
                onClose={() => setFiltersModalOpened(false)}
                withCloseButton={false}
            />
        </Box>
    );
};

export default Filters;

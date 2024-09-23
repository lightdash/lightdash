import { Box, Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setIsFiltersModalOpen } from '../store/semanticViewerSlice';
import BadgeButton from './BadgeButton';
import FiltersModal from './FiltersModal';

const Filters: FC = () => {
    const { filters } = useAppSelector((state) => state.semanticViewer);
    const filtersCount = useMemo(() => Object.keys(filters).length, [filters]);

    const dispatch = useAppDispatch();
    const { isFiltersModalOpen } = useAppSelector(
        (state) => state.semanticViewer,
    );

    const closeFiltersModal = () => {
        dispatch(setIsFiltersModalOpen(false));
    };

    const openFiltersModal = () => {
        dispatch(setIsFiltersModalOpen(true));
    };

    return (
        <Box>
            {filtersCount > 0 ? (
                <BadgeButton variant="outline" onClick={openFiltersModal}>
                    Filters ({filtersCount})
                </BadgeButton>
            ) : (
                <Button
                    onClick={openFiltersModal}
                    variant="outline"
                    leftIcon={<IconPlus size={14} />}
                    size="xs"
                >
                    Add filters
                </Button>
            )}

            <FiltersModal
                size="xl"
                opened={isFiltersModalOpen}
                onClose={closeFiltersModal}
                withCloseButton={false}
            />
        </Box>
    );
};

export default Filters;

import { FC } from 'react';
import { useApp } from '../../../providers/AppProvider';
import { useExplorer } from '../../../providers/ExplorerProvider';
import ExploreFromHereButton from '../../ExploreFromHereButton';
import { RefreshButton } from '../../RefreshButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import SaveChartButton from '../SaveChartButton';
import { Wrapper } from './ExplorerHeader.styles';

const ExplorerHeader: FC = () => {
    const {
        state: { isEditMode, savedChart },
    } = useExplorer();

    const { user } = useApp();

    return (
        <Wrapper>
            {isEditMode ? (
                <>
                    <RefreshDbtButton />
                    <div>
                        <RefreshButton />
                        {!savedChart &&
                            user.data?.ability?.can('manage', 'SavedChart') && (
                                <SaveChartButton isExplorer />
                            )}
                    </div>
                </>
            ) : (
                <ExploreFromHereButton />
            )}
        </Wrapper>
    );
};

export default ExplorerHeader;

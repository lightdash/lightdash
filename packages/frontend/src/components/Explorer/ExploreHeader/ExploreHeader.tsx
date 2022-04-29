import { FC } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useUpdateMutation } from '../../../hooks/useSavedQuery';
import { useExplorer } from '../../../providers/ExplorerProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import EditableHeader from '../../common/EditableHeader';
import { RefreshButton } from '../../RefreshButton';
import RefreshServerButton from '../../RefreshServer';
import { TitleWrapper, Wrapper } from './ExploreHeader.styles';

const ExploreHeader: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const location = useLocation<
        { fromExplorer?: boolean; explore?: boolean } | undefined
    >();
    const {
        state: { chartName, unsavedChartVersion, savedChart },
    } = useExplorer();
    const updateSavedChart = useUpdateMutation(savedChart?.uuid);

    const searchParams = new URLSearchParams(location.search);

    const overrideQueryUuid: string | undefined = searchParams.get('explore')
        ? undefined
        : savedChart?.uuid;
    return (
        <TrackSection name={SectionName.EXPLORER_TOP_BUTTONS}>
            <Wrapper>
                <TitleWrapper>
                    {overrideQueryUuid && chartName && (
                        <EditableHeader
                            value={chartName}
                            isDisabled={updateSavedChart.isLoading}
                            onChange={(newName) =>
                                updateSavedChart.mutate({ name: newName })
                            }
                        />
                    )}
                </TitleWrapper>
                <RefreshButton />
                <RefreshServerButton />
            </Wrapper>
        </TrackSection>
    );
};

export default ExploreHeader;

import { usePortalTargetById } from '../../../hooks/usePortalTargetById';
import { VisualizationConfigPortalId } from '../ExplorePanel/constants';

const useVisualizationConfigPortalTarget = (isOpen: boolean) =>
    usePortalTargetById(VisualizationConfigPortalId, isOpen);

export default useVisualizationConfigPortalTarget;

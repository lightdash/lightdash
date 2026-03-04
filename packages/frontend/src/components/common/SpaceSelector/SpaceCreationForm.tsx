import { InheritanceType } from '../ShareSpaceModal/v2/ShareSpaceModalUtils';
import SpaceCreationFormV2 from './SpaceCreationFormV2';

type SpaceCreationFormProps = {
    spaceName: string;
    onSpaceNameChange: (name: string) => void;
    onCancel: () => void;
    isLoading?: boolean;
    parentSpaceName?: string;
    inheritanceValue?: InheritanceType;
    onInheritanceChange?: (value: InheritanceType) => void;
};

const SpaceCreationForm = ({
    spaceName,
    onSpaceNameChange,
    onCancel,
    isLoading,
    parentSpaceName,
    inheritanceValue,
    onInheritanceChange,
}: SpaceCreationFormProps) => {
    return (
        <SpaceCreationFormV2
            spaceName={spaceName}
            onSpaceNameChange={onSpaceNameChange}
            onCancel={onCancel}
            isLoading={isLoading}
            parentSpaceName={parentSpaceName}
            inheritanceValue={inheritanceValue ?? InheritanceType.OWN_ONLY}
            onInheritanceChange={onInheritanceChange ?? (() => {})}
        />
    );
};

export default SpaceCreationForm;

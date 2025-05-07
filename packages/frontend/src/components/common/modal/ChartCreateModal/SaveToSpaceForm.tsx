import { ResourceViewItemType, type SpaceSummary } from '@lightdash/common';
import { type UseFormReturnType } from '@mantine/form';
import { type useSpaceManagement } from '../../../../hooks/useSpaceManagement';
import SpaceCreationForm from '../../SpaceSelector/SpaceCreationForm';
import SpaceSelector from '../../SpaceSelector/SpaceSelector';
import { type SaveToSpaceFormType } from './types';

type Props<T extends SaveToSpaceFormType> = {
    form: UseFormReturnType<T>;
    isLoading: boolean;
    spaces: SpaceSummary[] | undefined;
    projectUuid?: string;
    spaceManagement: ReturnType<typeof useSpaceManagement>;
    selectedSpaceName?: string;
};

const SaveToSpaceForm = <T extends SaveToSpaceFormType>({
    form,
    isLoading,
    spaces = [],
    projectUuid,
    spaceManagement,
    selectedSpaceName,
}: Props<T>) => {
    const {
        isCreatingNewSpace,
        newSpaceName,
        setNewSpaceName,
        selectedSpaceUuid,
        setSelectedSpaceUuid,
        closeCreateSpaceForm,
    } = spaceManagement;

    if (isCreatingNewSpace) {
        return (
            <SpaceCreationForm
                spaceName={newSpaceName}
                onSpaceNameChange={(value) => {
                    setNewSpaceName(value);
                    // @ts-ignore - form types are complex with generics
                    form.setFieldValue('newSpaceName', value);
                }}
                onCancel={() => {
                    closeCreateSpaceForm();
                    // @ts-ignore - form types are complex with generics
                    form.setFieldValue('newSpaceName', null);
                }}
                isLoading={isLoading}
                parentSpaceName={selectedSpaceName}
            />
        );
    }

    return (
        <SpaceSelector
            projectUuid={projectUuid}
            itemType={ResourceViewItemType.CHART}
            spaces={spaces}
            selectedSpaceUuid={selectedSpaceUuid}
            onSelectSpace={(spaceUuid: string | null) => {
                setSelectedSpaceUuid(spaceUuid);
                // @ts-ignore, mantine form is not well typed to support generic + null value setting
                form.setFieldValue('spaceUuid', spaceUuid);
            }}
            isLoading={isLoading}
        />
    );
};

export default SaveToSpaceForm;

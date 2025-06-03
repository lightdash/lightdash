import { useCallback, useEffect, useState } from 'react';
import { useCreateMutation } from './useSpaces';

type UseSpaceManagementProps = {
    projectUuid?: string;
    defaultSpaceUuid?: string;
};

/**
 * This hook is used to manage the space management UI.
 * It is used to create a new space (nested or not) and to select a space.
 */
export const useSpaceManagement = ({
    projectUuid,
    defaultSpaceUuid,
}: UseSpaceManagementProps = {}) => {
    const [selectedSpaceUuid, setSelectedSpaceUuid] = useState<string | null>(
        defaultSpaceUuid || null,
    );
    const [isCreatingNewSpace, setIsCreatingNewSpace] = useState(false);
    const [newSpaceName, setNewSpaceName] = useState('');

    const createSpaceMutation = useCreateMutation(projectUuid);

    useEffect(() => {
        setSelectedSpaceUuid(defaultSpaceUuid || null);
    }, [defaultSpaceUuid]);

    const handleCreateNewSpace = useCallback(
        async ({ isPrivate }: { isPrivate?: boolean } = {}) => {
            if (newSpaceName.length === 0) return;

            const result = await createSpaceMutation.mutateAsync({
                name: newSpaceName,
                parentSpaceUuid: selectedSpaceUuid || undefined,
                ...(isPrivate && { isPrivate }),
            });

            // Reset form state after successful creation
            setNewSpaceName('');
            setIsCreatingNewSpace(false);

            return result;
        },
        [createSpaceMutation, newSpaceName, selectedSpaceUuid],
    );

    const openCreateSpaceForm = useCallback(() => {
        setIsCreatingNewSpace(true);
    }, []);

    const closeCreateSpaceForm = useCallback(() => {
        setIsCreatingNewSpace(false);
        setNewSpaceName('');
    }, []);

    return {
        selectedSpaceUuid,
        setSelectedSpaceUuid,
        isCreatingNewSpace,
        setIsCreatingNewSpace,
        newSpaceName,
        setNewSpaceName,
        createSpaceMutation,
        handleCreateNewSpace,
        openCreateSpaceForm,
        closeCreateSpaceForm,
    };
};

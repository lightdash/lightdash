import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemRenderer } from '@blueprintjs/select';
import { Space } from '@lightdash/common';
import {
    PrimaryText,
    SecondaryTextWithMaxWidth,
} from './ShareSpaceModal.style';

export interface AccessOption {
    title: string;
    description?: string;
    selectDescription: string;
    value: string;
}

export const enum SpaceAccessType {
    PRIVATE = 'private',
    SHARED = 'shared',
    PUBLIC = 'public',
}

export const getSpacePermissionValue = (space: Space): SpaceAccessType => {
    if (space.isPrivate) {
        if (space.access?.length === 0) {
            return SpaceAccessType.PRIVATE;
        } else {
            return SpaceAccessType.SHARED;
        }
    } else {
        return SpaceAccessType.PUBLIC;
    }
};

export const renderAccess: ItemRenderer<AccessOption> = (
    access,
    { handleClick, handleFocus, modifiers },
) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem2
            key={access.value}
            multiline={true}
            active={modifiers.active}
            disabled={modifiers.disabled}
            onClick={handleClick}
            onFocus={handleFocus}
            text={
                <>
                    <PrimaryText>{access.title}</PrimaryText>
                    <SecondaryTextWithMaxWidth>
                        {access.selectDescription}
                    </SecondaryTextWithMaxWidth>
                </>
            }
        />
    );
};

export const SpaceAccessOptions: AccessOption[] = [
    {
        title: 'Private',
        description: 'Only you and admins can access this space.',
        selectDescription: 'Only you and admins can access this space.',
        value: SpaceAccessType.PRIVATE,
    },
    {
        title: 'Shared',
        description: 'Only invited members and admins can access this space.',
        selectDescription:
            'Only invited members and admins can access this space.',
        value: SpaceAccessType.SHARED,
    },
    {
        title: 'Public',
        description: 'Everyone can access space.',
        selectDescription: 'Everyone can access space.',
        value: SpaceAccessType.PUBLIC,
    },
];

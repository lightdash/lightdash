import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemRenderer } from '@blueprintjs/select';
import {
    AccessSelectSubtitle,
    AccessSelectTitle,
} from './ShareSpaceModal.style';

export interface AccessOption {
    title: string;
    description?: string;
    selectDescription: string;
    value: string;
}

export const renderAccess: ItemRenderer<AccessOption> = (
    access,
    { handleClick, handleFocus, modifiers, query },
) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem2
            multiline={true}
            active={modifiers.active}
            disabled={modifiers.disabled}
            key={access.value}
            onClick={handleClick}
            onFocus={handleFocus}
            text={
                <>
                    <AccessSelectTitle>{access.title}</AccessSelectTitle>
                    <AccessSelectSubtitle>
                        {access.selectDescription}
                    </AccessSelectSubtitle>
                </>
            }
        />
    );
};

export const enum SpaceAccessType {
    PRIVATE = 'private',
    PUBLIC = 'public',
}
export const SpaceAccessOptions: AccessOption[] = [
    {
        title: 'Restricted access',
        description: 'Only invited members can access',
        selectDescription: 'Only invited members can access',
        value: SpaceAccessType.PRIVATE,
    },
    {
        title: 'Full access',
        description: 'All project members can access',
        selectDescription:
            'All project members can access with their project permissions',
        value: SpaceAccessType.PUBLIC,
    },
];

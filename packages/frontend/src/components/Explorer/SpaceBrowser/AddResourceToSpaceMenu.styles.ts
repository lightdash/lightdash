import { MenuItem2 } from '@blueprintjs/popover2';
import styled from 'styled-components';

interface AddNewResourceToSpaceMenuItemProps {
    addExistingIsHidden: boolean;
}

export const AddExistingResourceToSpaceMenuItem = styled(MenuItem2)`
    margin-left: -5px;
    margin-right: -5px;
    margin-top: -5px;
`;

export const AddNewResourceToSpaceMenuItem = styled(
    MenuItem2,
)<AddNewResourceToSpaceMenuItemProps>`
    margin-left: -5px;
    margin-right: -5px;
    margin-bottom: -5px;
    ${(props) =>
        props.addExistingIsHidden
            ? `
                margin-top: -5px;
            `
            : ''}
`;

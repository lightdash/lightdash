import { Colors, Tag } from '@blueprintjs/core';
import styled from 'styled-components';

export const TagContainer = styled(Tag)`
    flex-shrink: 0;
`;

export const InvalidFilterTag = styled(TagContainer)`
    background: transparent;
    color: ${Colors.GRAY1};

    & span,
    & .bp4-tag-remove > .bp4-icon:first-child {
        color: ${Colors.GRAY1};
    }

    & .bp4-tag-remove > .bp4-icon:first-child:hover {
        color: ${Colors.GRAY3};
    }
`;

export const FilterValues = styled.span`
    font-weight: 700;
`;

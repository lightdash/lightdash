import { Colors, Tag } from '@blueprintjs/core';
import styled from 'styled-components';

export const TagContainer = styled(Tag)`
    width: fit-content;
    padding: 0 0.5em;
    border-radius: 0.214em;

    & span {
        color: ${Colors.WHITE};
    }
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

export const TagsWrapper = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5em;
    padding-top: 0.2em;
`;

export const FilterValues = styled.span`
    font-weight: 700;
`;

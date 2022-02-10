import { Colors, Tag } from '@blueprintjs/core';
import styled from 'styled-components';

export const TagContainer = styled(Tag)`
    width: fit-content;
    padding: 0 0.5em;
    background: #5c7080 !important;
    border-radius: 0.214em;

    & span {
        color: ${Colors.WHITE};
    }
`;

export const TagsWrapper = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5em;
`;

export const FilterValues = styled.span`
    font-weight: 700;
`;

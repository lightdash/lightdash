import { Link } from 'react-router-dom';
import styled from 'styled-components';

export const StyledNavLink = styled(Link)`
    &:hover {
        text-decoration: none;
    }

    li {
        color: white;
    }
`;

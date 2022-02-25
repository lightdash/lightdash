import { AnchorButton, Colors } from '@blueprintjs/core';
import { ComponentProps, FC } from 'react';
import styled from 'styled-components';

const StyledAnchorButton = styled(AnchorButton)`
    color: ${Colors.BLUE3} !important;
    font-weight: 500;
    white-space: nowrap;

    & span.bp3-icon {
        width: 12px;
        height: 12px;

        & svg {
            width: 12px;
            height: 12px;

            & path {
                fill: ${Colors.BLUE3} !important;
            }
        }
    }

    :hover {
        background: transparent !important;

        & span {
            text-decoration: underline;
        }
    }

    :focus,
    :active {
        outline: none;

        & span {
            text-decoration: underline;
        }
    }
`;

const SimpleButton: FC<ComponentProps<typeof AnchorButton>> = (props) => {
    return <StyledAnchorButton minimal {...props} />;
};

export default SimpleButton;

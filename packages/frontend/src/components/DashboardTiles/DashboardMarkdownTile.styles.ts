import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const MarkdownWrapper = styled.div`
    flex: 1;
    overflow: auto;

    .wmde-markdown {
        font-size: 14px;
        p {
            color: ${Colors.GRAY1};
        }
    }
`;

import styled from 'styled-components';

export const SpacePanelWrapper = styled.div`
    .bp4-card:last-child {
        margin-top: 20px;
    }

    h3 {
        font-size: 18px;
    }
`;

export const SpacePanelHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 11px 0px 31px 0px;
`;

export const BreadcrumbsWrapper = styled.div`
    .bp4-breadcrumb {
        font-size: 22px;
        font-weight: 500;
    }
    .home-breadcrumb {
        color: #5c7080;
    }

    .bp4-breadcrumbs > li::after {
        margin-top: 5px;
    }
`;

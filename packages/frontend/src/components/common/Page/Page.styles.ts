import styled from 'styled-components';

export const PageContentWrapper = styled.div`
    h3 {
        font-size: 18px;
    }
`;

export const PageHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 11px 0px 31px 0px;
`;

export const PageBreadcrumbsWrapper = styled.div`
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

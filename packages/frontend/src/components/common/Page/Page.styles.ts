import styled from 'styled-components';

export const PageContentContainer = styled.div`
    padding: 10px 20px;
    display: flex;
    flex-direction: column;
    width: 100vw;
    gap: 10px;
`;

export const PageContentWrapper = styled.div`
    .bp4-card:not(:last-child) {
        margin-bottom: 20px;
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

import styled from 'styled-components';
import { ReactComponent as Dialog } from '../../svgs/dialog.svg';
import { ReactComponent as Logo } from '../../svgs/logo-dark.svg';

export const MobileViewWrapper = styled.div`
    background: #ebf1f5;
    width: 100vw;
    height: 100vh;
`;

export const Content = styled.div`
    padding: 4.125rem 2.6875rem 0;
    text-align: center;
`;

export const DarkLogo = styled(Logo)`
    width: 8.375rem;
`;

export const Icon = styled.span`
    font-size: 2.5rem;
    display: block;
    margin-top: 1.875rem;
`;

export const Text = styled.p`
    max-width: 14.6875rem;
    font-size: 1rem;
    line-height: 1.125rem;
    color: #5c7080;
    margin: 1.5rem auto;
`;

export const MobileFooter = styled.div`
    height: 3.625rem;
    width: 100%;
    position: absolute;
    padding: 1.125rem;
    bottom: 0;
    border-top: 1px solid #d8dbde;
    text-align: center;
    font-size: 0.875rem;
    line-height: 1.125rem;
    color: #10161a;

    & a {
        justify-content: center;
        align-content: center;
        margin: 0 !important;
    }
`;

export const DialogIcon = styled(Dialog)`
    margin-right: 0.4375rem;
`;

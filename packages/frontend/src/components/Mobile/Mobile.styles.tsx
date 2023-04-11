import styled from 'styled-components';
import { ReactComponent as Logo } from '../../svgs/lightdash-black.svg';

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
    font-size: 1.125rem;
    font-weight: 500;
    line-height: 1.3125rem;
    color: #000000;
    margin: 1.5rem auto;
`;

export const Paragraph = styled.p`
    max-width: 14.6875rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: #5c7080;
    margin: 1.5rem auto;
`;

export const Button = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 10px 15px;
    gap: 8px;
    position: absolute;
    left: 6.88%;
    right: 6.88%;
    top: 58.98%;
    bottom: 33.98%;
    background: #2d72d2;
    border: 1px solid #1e5f87;
    box-shadow: inset 0px -1px 1px rgba(16, 22, 26, 0.2);
    border-radius: 3px;
    color: #ffffff;
    font-weight: 500;
`;

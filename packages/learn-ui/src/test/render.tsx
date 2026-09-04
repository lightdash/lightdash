import { MantineProvider } from '@mantine/core';
import { render, type RenderResult } from '@testing-library/react';
import { type FC, type PropsWithChildren, type ReactElement } from 'react';

// eslint-disable-next-line react/only-export-components -- test utility, not a real module for fast refresh
const Wrapper: FC<PropsWithChildren> = ({ children }) => (
    <MantineProvider>{children}</MantineProvider>
);

export const renderWithMantine = (ui: ReactElement): RenderResult =>
    render(ui, { wrapper: Wrapper });

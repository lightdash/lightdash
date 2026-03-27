import type { CSSProperties, ReactNode } from 'react';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { TestAppHeader } from './TestAppHeader';

type TestAppLayoutProps = {
    children: ReactNode;
    controls?: ReactNode;
    embedConfig: EmbedConfigState;
    footer?: ReactNode;
};

const sans = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

const containerStyle: CSSProperties = {
    fontFamily: sans,
    backgroundColor: '#fff',
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 20px',
};

const contentStyle: CSSProperties = {
    maxWidth: '1200px',
    width: '100%',
};

const footerStyle: CSSProperties = {
    fontSize: '12px',
    color: '#a3a3a3',
    marginTop: '48px',
    paddingTop: '24px',
    borderTop: '1px solid #e5e5e5',
};

export function TestAppLayout({
    children,
    controls,
    embedConfig,
    footer,
}: TestAppLayoutProps) {
    return (
        <div style={containerStyle}>
            <div style={contentStyle}>
                <TestAppHeader embedConfig={embedConfig} controls={controls} />
                <main>{children}</main>
                <footer style={footerStyle}>{footer}</footer>
            </div>
        </div>
    );
}

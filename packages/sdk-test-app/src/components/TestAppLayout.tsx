import type { CSSProperties, ReactNode } from 'react';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { footerContentStyle, sansFontFamily } from '../styles';
import { TestAppHeader } from './TestAppHeader';

type TestAppLayoutProps = {
    children: ReactNode;
    controls?: ReactNode;
    embedConfig: EmbedConfigState;
    footerLabel?: string;
    footerUrl?: string;
};

const containerStyle: CSSProperties = {
    fontFamily: sansFontFamily,
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
    footerLabel = 'Repo',
    footerUrl = 'https://github.com/lightdash/lightdash/tree/main/packages/sdk-test-app',
}: TestAppLayoutProps) {
    return (
        <div style={containerStyle}>
            <div style={contentStyle}>
                <TestAppHeader embedConfig={embedConfig} controls={controls} />
                <main>{children}</main>
                <footer style={footerStyle}>
                    <div style={footerContentStyle}>
                        <span>© 2026 Lightdash</span>
                        <a href={footerUrl} target="_blank" rel="noreferrer">
                            {footerLabel}
                        </a>
                    </div>
                </footer>
            </div>
        </div>
    );
}

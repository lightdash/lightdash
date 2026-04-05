import type { ReactNode } from 'react';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { Link } from '../router';
import {
    backLinkStyle,
    examplePageContentStyle,
    examplePageDescriptionStyle,
    examplePageTitleStyle,
} from '../styles';
import { TestAppLayout } from './TestAppLayout';

type ExampleLayoutProps = {
    children: ReactNode;
    controls?: ReactNode;
    description: ReactNode;
    embedConfig: EmbedConfigState;
    sourceUrl: string;
    title: ReactNode;
};

export function ExampleLayout({
    children,
    controls,
    description,
    embedConfig,
    sourceUrl,
    title,
}: ExampleLayoutProps) {
    return (
        <TestAppLayout
            embedConfig={embedConfig}
            controls={controls}
            footerUrl={sourceUrl}
            footerLabel="Source code"
        >
            <div style={examplePageContentStyle}>
                <div>
                    <Link href="/" style={backLinkStyle}>
                        ← Back to examples
                    </Link>
                    <h2 style={examplePageTitleStyle}>{title}</h2>
                    <p style={examplePageDescriptionStyle}>{description}</p>
                </div>
                {children}
            </div>
        </TestAppLayout>
    );
}

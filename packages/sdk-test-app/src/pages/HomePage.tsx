import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { TestAppLayout } from '../components/TestAppLayout';
import { examples } from '../examples/examples';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';

type HomePageProps = {
    embedConfig: EmbedConfigState;
};

const sans = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

const pageTitleStyle: CSSProperties = {
    fontFamily: sans,
    fontSize: '40px',
    lineHeight: 1,
    letterSpacing: '-0.05em',
    color: '#171717',
    margin: 0,
};

const pageDescriptionStyle: CSSProperties = {
    fontSize: '16px',
    lineHeight: 1.7,
    color: '#525252',
    maxWidth: '760px',
    margin: '16px 0 0 0',
};

const cardGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
    marginTop: '32px',
};

const cardStyle: CSSProperties = {
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
    backgroundColor: '#fafafa',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
};

const cardTitleStyle: CSSProperties = {
    fontSize: '18px',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    color: '#171717',
    margin: 0,
};

const cardDescriptionStyle: CSSProperties = {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#525252',
    margin: 0,
};

const cardFooterStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginTop: 'auto',
};

export function HomePage({ embedConfig }: HomePageProps) {
    return (
        <TestAppLayout
            embedConfig={embedConfig}
            footer={
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '12px',
                        flexWrap: 'wrap',
                    }}
                >
                    <span>© 2026 Lightdash</span>
                    <a
                        href="https://github.com/lightdash/lightdash/tree/main/packages/sdk-test-app"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Repo
                    </a>
                </div>
            }
        >
            <section>
                <h2 style={pageTitleStyle}>SDK examples</h2>
                <p style={pageDescriptionStyle}>
                    The test app now acts as a small examples browser. Configure
                    an embed URL once in the header, then move between focused
                    example pages as we add more scenarios.
                </p>

                <div style={cardGridStyle}>
                    {examples.map((example) => (
                        <article key={example.slug} style={cardStyle}>
                            <div>
                                <h3 style={cardTitleStyle}>{example.title}</h3>
                                <p style={cardDescriptionStyle}>
                                    {example.description}
                                </p>
                            </div>
                            <div style={cardFooterStyle}>
                                <Link to={example.path}>Open example</Link>
                                <a
                                    href={getRepoSourceUrl(example.sourcePath)}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Source
                                </a>
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </TestAppLayout>
    );
}

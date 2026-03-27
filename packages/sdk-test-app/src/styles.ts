import type { CSSProperties } from 'react';

export const monoFontFamily =
    "'SF Mono', 'Fira Code', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace";
export const sansFontFamily =
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export const backLinkStyle: CSSProperties = {
    color: '#737373',
    textDecoration: 'none',
};

export const examplePageTitleStyle: CSSProperties = {
    fontFamily: sansFontFamily,
    fontSize: '32px',
    lineHeight: 1.15,
    letterSpacing: '-0.04em',
    color: '#171717',
    margin: 0,
};

export const examplePageDescriptionStyle: CSSProperties = {
    fontSize: '15px',
    lineHeight: 1.7,
    color: '#525252',
    maxWidth: '760px',
    margin: '12px 0 0 0',
};

export const examplePageContentStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
};

export const footerContentStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
};

export const emptyStateStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    color: '#737373',
};

export const emptyStateBoxStyle: CSSProperties = {
    fontFamily: monoFontFamily,
    fontSize: '13px',
    padding: '16px 24px',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
};

import type { CSSProperties } from 'react';
import { monoFontFamily, sansFontFamily } from '../styles';

export const dashboardContainerStyle: CSSProperties = {
    width: '100%',
    height: '700px',
    minHeight: '320px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    backgroundColor: '#fafafa',
    overflow: 'auto',
    resize: 'vertical',
};

export const infoBoxStyle: CSSProperties = {
    fontFamily: monoFontFamily,
    fontSize: '13px',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    padding: '16px',
    color: '#525252',
    borderRadius: '6px',
    margin: 0,
};

export const pageTitleStyle: CSSProperties = {
    fontFamily: sansFontFamily,
    fontSize: '32px',
    lineHeight: 1.15,
    letterSpacing: '-0.04em',
    color: '#171717',
    margin: 0,
};

export const pageDescriptionStyle: CSSProperties = {
    fontSize: '15px',
    lineHeight: 1.7,
    color: '#525252',
    maxWidth: '760px',
    margin: '12px 0 0 0',
};

export const sectionTitleStyle: CSSProperties = {
    fontSize: '14px',
    fontWeight: 600,
    color: '#171717',
    margin: '32px 0 8px 0',
    letterSpacing: '-0.01em',
};

export const sectionDescStyle: CSSProperties = {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#737373',
    margin: '0 0 20px 0',
};

export const panelLabelStyle: CSSProperties = {
    fontSize: '12px',
    fontWeight: 500,
    color: '#525252',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
    display: 'block',
};

export const helperTextStyle: CSSProperties = {
    fontSize: '13px',
    lineHeight: 1.6,
    color: '#737373',
    margin: '8px 0 0 0',
};

export const filterPanelGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
    alignItems: 'start',
};

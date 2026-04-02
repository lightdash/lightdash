import type { CSSProperties } from 'react';
import { monoFontFamily, sansFontFamily } from '../styles';

export const buttonStyle: CSSProperties = {
    fontFamily: sansFontFamily,
    fontSize: '13px',
    fontWeight: 500,
    padding: '10px 16px',
    border: '1px solid #171717',
    borderRadius: '6px',
    backgroundColor: '#171717',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
};

export const buttonSecondaryStyle: CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#fff',
    color: '#171717',
    border: '1px solid #e5e5e5',
};

export const inputStyle: CSSProperties = {
    fontFamily: monoFontFamily,
    fontSize: '13px',
    padding: '10px 12px',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    backgroundColor: '#fafafa',
    color: '#171717',
    outline: 'none',
    transition: 'border-color 0.15s ease',
};

export const labelStyle: CSSProperties = {
    fontSize: '12px',
    fontWeight: 500,
    color: '#525252',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
    display: 'block',
};

export const chartContainerStyle: CSSProperties = {
    width: '100%',
    height: '500px',
    minHeight: '200px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    overflow: 'auto',
    resize: 'vertical',
};

export const singleChartContainerStyle: CSSProperties = {
    width: '100%',
    maxWidth: '720px',
    height: '500px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    backgroundColor: '#fafafa',
    overflow: 'hidden',
};

export const infoBoxStyle: CSSProperties = {
    fontFamily: monoFontFamily,
    fontSize: '13px',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    padding: '16px',
    margin: '24px 0',
    color: '#525252',
    borderRadius: '6px',
};

export const sectionTitleStyle: CSSProperties = {
    fontSize: '14px',
    fontWeight: 600,
    color: '#171717',
    margin: '48px 0 8px 0',
    letterSpacing: '-0.01em',
};

export const sectionDescStyle: CSSProperties = {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#737373',
    margin: '0 0 20px 0',
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

export const controlsStyle: CSSProperties = {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    flexWrap: 'wrap',
};

export const langButtonStyle = (isActive: boolean): CSSProperties => ({
    fontSize: '14px',
    padding: '6px 10px',
    border: isActive ? '1px solid #171717' : '1px solid #e5e5e5',
    borderRadius: '6px',
    backgroundColor: isActive ? '#171717' : '#fff',
    color: isActive ? '#fff' : '#171717',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
});

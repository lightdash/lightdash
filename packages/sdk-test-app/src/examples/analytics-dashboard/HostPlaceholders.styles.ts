import type { CSSProperties } from 'react';
import { sansFontFamily } from '../../styles';

const ink = '#1e1b4b';
const accent = '#3b2cc9';
const muted = '#5b5875';
const border = '#dcdaf0';

export const appShellStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '56px 1fr',
    minHeight: '900px',
    border: `1px solid ${border}`,
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: '#f6f5fd',
    fontFamily: sansFontFamily,
    color: ink,
};

export const railStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 0',
    backgroundColor: '#ffffff',
    borderRight: `1px solid ${border}`,
};

export const brandMarkStyle: CSSProperties = {
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    backgroundColor: ink,
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12px',
};

export const getRailItemStyle = (isActive: boolean): CSSProperties => ({
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: isActive ? '#ffffff' : muted,
    backgroundColor: isActive ? accent : 'transparent',
});

export const mainStyle: CSSProperties = {
    padding: '20px 28px 28px',
    minWidth: 0,
};

export const breadcrumbStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: muted,
};

export const breadcrumbCurrentStyle: CSSProperties = {
    color: ink,
    fontWeight: 600,
};

export const pageTitleStyle: CSSProperties = {
    fontSize: '26px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: '12px 0 4px',
    color: ink,
};

export const pageSubtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: muted,
    margin: 0,
};

export const tabListStyle: CSSProperties = {
    display: 'flex',
    gap: '4px',
    margin: '20px 0 16px',
    borderBottom: `1px solid ${border}`,
};

export const getTabStyle = (isActive: boolean): CSSProperties => ({
    appearance: 'none',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: isActive ? 600 : 500,
    color: isActive ? ink : muted,
    padding: '8px 12px',
    marginBottom: '-1px',
    borderBottom: `2px solid ${isActive ? accent : 'transparent'}`,
});

export const filterBarStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
};

const getChevron = (color: string) =>
    `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${color}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>`,
    )}")`;

export const getFilterSelectStyle = (isActive: boolean): CSSProperties => ({
    appearance: 'none',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 500,
    height: '36px',
    minWidth: '170px',
    padding: '0 36px 0 12px',
    borderRadius: '8px',
    border: `1px solid ${isActive ? accent : border}`,
    backgroundColor: isActive ? '#eeecfd' : '#ffffff',
    backgroundImage: getChevron(isActive ? accent : muted),
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    color: isActive ? accent : ink,
    cursor: 'pointer',
});

export const applyButtonStyle: CSSProperties = {
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 600,
    height: '36px',
    padding: '0 14px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'transparent',
    color: accent,
    cursor: 'pointer',
};

export const applyButtonDisabledStyle: CSSProperties = {
    ...applyButtonStyle,
    color: '#a4a1c2',
    cursor: 'default',
};

export const updatedTextStyle: CSSProperties = {
    fontSize: '12px',
    color: muted,
    margin: '8px 0 16px',
};

export const dashboardFrameStyle: CSSProperties = {
    height: '1120px',
};

export const placeholderStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '320px',
    border: `1px dashed ${border}`,
    borderRadius: '12px',
    backgroundColor: '#ffffff',
    color: muted,
    fontSize: '14px',
    textAlign: 'center',
    padding: '0 24px',
};

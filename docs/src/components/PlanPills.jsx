import React from 'react';

const pillStyle = {
  backgroundColor: '#E8F4FD',
  color: '#0077CC',
  padding: '4px 12px',
  borderRadius: '16px',
  fontSize: '14px',
  fontWeight: '500',
  display: 'inline-flex',
  alignItems: 'center',
  marginBottom: '1rem',
  marginRight: '0.5rem'
};

export const CloudStarterPill = () => (
  <span style={pillStyle}>☁️ Cloud Starter</span>
);

export const CloudProPill = () => (
  <span style={pillStyle}>⚡ Cloud Pro</span>
);

export const CloudEnterprisePill = () => (
  <span style={pillStyle}>🚀 Cloud Enterprise</span>
);

export const AllCloudPills = () => (
  <div>
    <CloudStarterPill />
    <CloudProPill />
    <CloudEnterprisePill />
  </div>
); 
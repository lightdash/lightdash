export const GA4_DATA_ORIGIN = 'https://analyticsdata.googleapis.com';

export const getGa4ReportPath = (propertyId: string) =>
    `/v1beta/properties/${propertyId}:runReport`;

export const getGa4MetadataPath = (propertyId: string) =>
    `/v1beta/properties/${propertyId}/metadata`;

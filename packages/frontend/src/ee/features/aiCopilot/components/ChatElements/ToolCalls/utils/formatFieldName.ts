/**
 * Format field names for display (remove table prefix, convert to readable format)
 * e.g., "orders_order_date_month" -> "Order Date Month"
 */
export const formatFieldName = (fieldId: string): string => {
    const parts = fieldId.split('_');
    // Remove table prefix (first part) and capitalize remaining parts
    return parts
        .slice(1)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

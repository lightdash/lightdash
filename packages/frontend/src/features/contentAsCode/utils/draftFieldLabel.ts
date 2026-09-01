export const draftFieldLabel = (field: string) =>
    field === 'spaceSlug'
        ? 'Space'
        : field.charAt(0).toUpperCase() +
          field
              .slice(1)
              .replace(/([A-Z])/g, ' $1')
              .toLowerCase();

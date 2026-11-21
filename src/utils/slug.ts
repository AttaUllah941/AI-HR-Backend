/** Lowercase URL slug: letters, digits and single dashes only. */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'company';
}

/** Slug segments that would collide with application routes. */
export const RESERVED_SLUGS = new Set(['admin', 'api', 'auth', 'company', 'platform', 'login', 'www']);

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

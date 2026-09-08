import DOMPurify from 'dompurify';

/**
 * Sanitizes untrusted HTML string to prevent Cross-Site Scripting (XSS).
 * Allows only safe formatting tags and attributes.
 */
export function sanitizeHtml(untrustedHtml: string | null | undefined): string {
  if (!untrustedHtml) return '';
  return DOMPurify.sanitize(untrustedHtml, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
  });
}

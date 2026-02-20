/**
 * List of available redirect targets with their actual URLs
 */
export const REDIRECT_TARGETS = {
  'google-reviews': {
    label: 'Google Reviews',
    url: 'https://www.google.com/search?sca_esv=a420dcef264fc5ad&tbm=lcl&sxsrf=AE3TifPiQBSvRxmNeGro4O_nsZzQcPG1XA:1760021518520&q=Hookah+Tabacu+Recenzii&rflfq=1&num=20&stick=H4sIAAAAAAAAAONgkxIxNDMxtDC2NDAwMTczszQyMLQ0MtrAyPiKUcwjPz87MUMhJDEpMblUISg1OTWvKjNzESsOCQCs8uH2TQAAAA&rldimm=16418390047669201922&hl=ro-RO&sa=X&ved=2ahUKEwiK9qGLr5eQAxWL87sIHQK3KIIQ9fQKegQIVBAF&biw=2056&bih=1290&dpr=2#lkt=LocalPoiReviews',
  },
  'tripadvisor': {
    label: 'TripAdvisor',
    url: 'https://www.tripadvisor.com/Restaurant_Review-g298474-d26352926-Reviews-Hookah_Tabacu-Cluj_Napoca_Cluj_County_Northwest_Romania_Transylvania.html',
  },
} as const;

export type RedirectTarget = keyof typeof REDIRECT_TARGETS;

/**
 * Generate a redirect URL for tracking user activity
 * @param target - The redirect target identifier (e.g., 'google-reviews', 'tripadvisor')
 * @param source - Optional source to differentiate traffic (e.g., 'website', 'qr-code')
 * @returns The redirect URL
 */
export const generateRedirectUrl = (target: string, source?: string): string => {
  const targetData = REDIRECT_TARGETS[target as RedirectTarget];
  return targetData?.url || '';
};

/**
 * Get the QR code data for a redirect link
 * Can be used with QR code libraries like `qrcode.react` or `html5-qrcode`
 * @param target - The redirect target identifier
 * @param source - Optional source identifier (e.g., 'qr-code')
 * @returns The full URL to be encoded in QR code
 */
export const getQRCodeData = (target: string, source: string = 'qr-code'): string => {
  return generateRedirectUrl(target, source);
};

/**
 * Perform a redirect with Firebase tracking
 * Opens the target URL in a new window and logs the event to Firestore
 * @param target - The redirect target identifier
 * @param source - Optional source to differentiate traffic (defaults to 'website')
 */
export const performRedirect = async (target: string, source: string = 'website'): Promise<void> => {
  // Import here to avoid circular dependencies
  const { logRedirectEvent } = await import('@/services/redirectService');
  
  logRedirectEvent({ target, source }).catch(() => {
    // Silently catch errors - don't interrupt the redirect
  });
  
  const url = generateRedirectUrl(target, source);
  if (url) {
    window.open(url, '_blank');
  }
};

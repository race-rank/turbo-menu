import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const { target, source } = req.query;

  // List of allowed redirect targets
  const allowedTargets: { [key: string]: string } = {
    'google-reviews': 'https://www.google.com/search?sca_esv=a420dcef264fc5ad&tbm=lcl&sxsrf=AE3TifPiQBSvRxmNeGro4O_nsZzQcPG1XA:1760021518520&q=Hookah+Tabacu+Recenzii&rflfq=1&num=20&stick=H4sIAAAAAAAAAONgkxIxNDMxtDC2NDAwMTczszQyMLQ0MtrAyPiKUcwjPz87MUMhJDEpMblUISg1OTWvKjNzESsOCQCs8uH2TQAAAA&rldimm=16418390047669201922&hl=ro-RO&sa=X&ved=2ahUKEwiK9qGLr5eQAxWL87sIHQK3KIIQ9fQKegQIVBAF&biw=2056&bih=1290&dpr=2#lkt=LocalPoiReviews',
    'tripadvisor': 'https://www.tripadvisor.com/Restaurant_Review-g298474-d26352926-Reviews-Hookah_Tabacu-Cluj_Napoca_Cluj_County_Northwest_Romania_Transylvania.html',
  };

  const redirectUrl = typeof target === 'string' ? allowedTargets[target] : null;

  if (!redirectUrl) {
    return res.status(404).json({ error: 'Redirect target not found' });
  }

  // Log the redirect access
  console.log({
    timestamp: new Date().toISOString(),
    target,
    source: typeof source === 'string' ? source : 'unknown',
    userAgent: req.headers['user-agent'],
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
  });

  // TODO: Add database logging for analytics
  // Example Firebase logging:
  // await admin.firestore().collection('redirects').add({
  //   target,
  //   source,
  //   timestamp: admin.firestore.FieldValue.serverTimestamp(),
  //   userAgent: req.headers['user-agent'],
  //   ip: req.headers['x-forwarded-for'],
  // });

  // Redirect to the target URL
  res.redirect(redirectUrl);
}

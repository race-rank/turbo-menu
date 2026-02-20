import { useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import Index from './Index';
import { logRedirectEvent } from '@/services/redirectService';

const redirectTargets: { [key: string]: string } = {
  'google-reviews': 'https://www.google.com/search?sca_esv=a420dcef264fc5ad&tbm=lcl&sxsrf=AE3TifPiQBSvRxmNeGro4O_nsZzQcPG1XA:1760021518520&q=Hookah+Tabacu+Recenzii&rflfq=1&num=20&stick=H4sIAAAAAAAAAONgkxIxNDMxtDC2NDAwMTczszQyMLQ0MtrAyPiKUcwjPz87MUMhJDEpMblUISg1OTWvKjNzESsOCQCs8uH2TQAAAA&rldimm=16418390047669201922&hl=ro-RO&sa=X&ved=2ahUKEwiK9qGLr5eQAxWL87sIHQK3KIIQ9fQKegQIVBAF&biw=2056&bih=1290&dpr=2#lkt=LocalPoiReviews',
  'tripadvisor': 'https://www.tripadvisor.com/Restaurant_Review-g298474-d26352926-Reviews-Hookah_Tabacu-Cluj_Napoca_Cluj_County_Northwest_Romania_Transylvania.html',
};

const RedirectPage = () => {
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const source = searchParams.get('source');

  const redirectUrl = redirect ? redirectTargets[redirect] : null;

  useEffect(() => {
    if (redirectUrl) {
      logRedirectEvent({
        target: redirect!,
        source: source || 'website',
      });
    }
  }, [redirect, source, redirectUrl]);

  if (!redirectUrl) {
    return <Index />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center bg-white p-10 rounded-lg shadow-sm">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Continue to Review</h1>
        <p className="text-gray-600 mb-8">Click the button below to leave a review.</p>
        <a
          href={redirectUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-8 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          Continue
        </a>
      </div>
    </div>
  );
};

export default RedirectPage;

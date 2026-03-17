import { useSearchParams } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import Index from './Index';
import { logRedirectEvent } from '@/services/redirectService';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const redirectTargets: Record<string, string> = {
  'google-reviews':
    'https://search.google.com/local/writereview?placeid=ChIJ_ygQq8ENSUcRAqwhj8LW2eM',
  tripadvisor:
    'https://www.tripadvisor.com/Restaurant_Review-g298474-d26352926-Reviews-Hookah_Tabacu-Cluj_Napoca_Cluj_County_Northwest_Romania_Transylvania.html',
};

const RedirectPage = () => {
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  const redirect = searchParams.get('redirect');
  const source = searchParams.get('source') || 'website';
  const redirectUrl = redirect ? redirectTargets[redirect] : null;

  /* ----------------------------
     SESSION ID
  -----------------------------*/
  const sessionId = useMemo(() => {
    const existing = sessionStorage.getItem('redirect_session');
    if (existing) return existing;

    const id = crypto.randomUUID();
    sessionStorage.setItem('redirect_session', id);
    return id;
  }, []);

  /* ----------------------------
     UTILITIES
  -----------------------------*/

  const withTimeout = <T,>(
    promise: Promise<T>,
    timeoutMs = 2000
  ): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      ),
    ]);

  const getGeolocation = (): Promise<{
    latitude?: number;
    longitude?: number;
  }> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});

      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }),
        () => resolve({}),
        { timeout: 2500 }
      );
    });

  const collectDeviceInfo = () => ({
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    devicePixelRatio: window.devicePixelRatio,
    platform: navigator.platform,
    isMobile: /Mobi|Android/i.test(navigator.userAgent),
    userAgent: navigator.userAgent,
  });

  const isBotLikely = () => {
    const ua = navigator.userAgent.toLowerCase();
    return (
      ua.includes('bot') ||
      ua.includes('crawl') ||
      ua.includes('spider') ||
      navigator.webdriver === true
    );
  };

  const sendAnalytics = async (
    eventType: 'page_view' | 'redirect_click',
    location?: { latitude?: number; longitude?: number }
  ) => {
    if (!redirect) return;

    const payload = {
      eventType,
      target: redirect,
      source,
      sessionId,
      timestamp: Date.now(),
      device: collectDeviceInfo(),
      location,
      bot: isBotLikely(),
    };

    await withTimeout(logRedirectEvent(payload), 2000);
  };

  /* ----------------------------
     PAGE VIEW LOGGING
  -----------------------------*/

  useEffect(() => {
    if (!redirectUrl) return;

    (async () => {
      try {
        const location = await getGeolocation();
        await sendAnalytics('page_view', location);
      } catch (err) {
        console.error('Page view logging failed:', err);
      }
    })();
  }, [redirectUrl]);

  /* ----------------------------
     CLICK HANDLER
  -----------------------------*/

  const handleContinueClick = async () => {
    if (!redirectUrl) return;

    setIsLoading(true);

    try {
      await sendAnalytics('redirect_click');
    } catch (err) {
      console.error('Click logging failed:', err);
    }

    // Always redirect regardless of logging result
    window.location.href = redirectUrl;
  };

  if (!redirectUrl) return <Index />;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center pb-24">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="flex flex-col items-center justify-center p-8">
          <h1 className="text-3xl font-bold mb-4 text-center">
            Continue to Review
          </h1>

          <p className="text-muted-foreground text-center mb-8">
            Click below to leave a review and help us improve.
          </p>

          <Button
            size="lg"
            className="w-full"
            onClick={handleContinueClick}
            disabled={isLoading}
          >
            {isLoading ? 'Redirecting...' : 'Continue'}
          </Button>
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4">
        <p className="text-xs text-muted-foreground text-center max-w-2xl mx-auto">
          We collect anonymized analytics (device type, approximate location,
          engagement data) solely to measure redirect performance. No personal
          data is sold or shared.
        </p>
      </div>
    </div>
  );
};

export default RedirectPage;
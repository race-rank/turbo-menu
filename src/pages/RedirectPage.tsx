import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import Index from './Index';
import { logRedirectEvent } from '@/services/redirectService';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const redirectTargets: { [key: string]: string } = {
  'google-reviews': 'https://share.google/aMLsRVptvzT6NOFKV',
  'tripadvisor': 'https://www.tripadvisor.com/Restaurant_Review-g298474-d26352926-Reviews-Hookah_Tabacu-Cluj_Napoca_Cluj_County_Northwest_Romania_Transylvania.html',
};

const RedirectPage = () => {
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const redirect = searchParams.get('redirect');
  const source = searchParams.get('source');

  const redirectUrl = redirect ? redirectTargets[redirect] : null;

  const logData = async (latitude?: number, longitude?: number) => {
    const userData = {
      target: redirect,
      source: source || 'website',
      latitude,
      longitude,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      devicePixelRatio: window.devicePixelRatio,
      platform: navigator.platform,
      oscpu: (navigator as any).oscpu,
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
    };

    await logRedirectEvent(userData);
  };

  const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number = 5000): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
      ),
    ]);
  };

  const getGeolocation = (): Promise<{ latitude?: number; longitude?: number }> => {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => {
          resolve({});
        },
        { timeout: 3000, enableHighAccuracy: false }
      );
    });
  };

  const handleContinueClick = async () => {
    if (redirectUrl && redirect) {
      setIsLoading(true);
      
      const newWindow = window.open(redirectUrl, '_blank');
      
      if (!newWindow) {
        window.location.href = redirectUrl;
      }
      
      try {
        const { latitude, longitude } = await getGeolocation();
        await withTimeout(logData(latitude, longitude), 2000);
      } catch (error) {
        console.error('Error logging redirect event:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (!redirectUrl) {
    return <Index />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center pb-24">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="flex flex-col items-center justify-center p-8">
          <h1 className="text-3xl font-bold mb-4 text-center">Continue to Review</h1>
          <p className="text-muted-foreground text-center mb-8">
            Click the button below to leave a review and help us improve.
          </p>
          <Button
            size="lg"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleContinueClick}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : 'Continue'}
          </Button>
        </CardContent>
      </Card>

      {/* GDPR Compliant Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4">
        <p className="text-xs text-muted-foreground text-center max-w-2xl mx-auto">
          We collect anonymized analytics data (location, device, browser info) solely to understand user engagement with this redirect. Your data is never sold, shared, or used for tracking purposes across other websites. You can decline location access without affecting functionality.
        </p>
      </div>
    </div>
  );
};

export default RedirectPage;

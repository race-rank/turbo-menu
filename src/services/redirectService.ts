import { firestore } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export interface RedirectLog {
  target: string;
  source?: string;
  timestamp: any;
  userAgent?: string;
  referrer?: string;
  pathname?: string;
}

/**
 * Log a redirect event to Firestore for analytics
 * Captures user agent, referrer, and current pathname
 */
export const logRedirectEvent = async (data: Omit<RedirectLog, 'timestamp'>) => {
  try {
    // Only log in browser environments
    if (typeof window === 'undefined') {
      return;
    }

    await addDoc(collection(firestore, 'redirects'), {
      ...data,
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent,
      referrer: document.referrer,
      pathname: window.location.pathname,
    });
  } catch (error) {
    console.error('Failed to log redirect event:', error);
    // Fail silently to not interrupt user flow
  }
};

/**
 * Get redirect statistics for a specific target
 * @param target - The redirect target identifier
 * @returns Count of redirects for that target
 */
export const getRedirectStats = async (target: string) => {
  try {
    // This is a placeholder - implement as needed with Firestore queries
    // import { query, where, getDocs } from 'firebase/firestore';
    // const q = query(collection(db, 'redirects'), where('target', '==', target));
    // const snapshot = await getDocs(q);
    // return snapshot.size;
    return 0;
  } catch (error) {
    console.error('Failed to fetch redirect stats:', error);
    return 0;
  }
};

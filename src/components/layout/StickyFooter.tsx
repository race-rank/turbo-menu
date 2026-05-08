import React, { ReactNode, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface StickyFooterProps {
  children: ReactNode;
  className?: string;
}

export const StickyFooter: React.FC<StickyFooterProps> = ({ children, className }) => {
  const [hasContentBelow, setHasContentBelow] = useState(false);

  useEffect(() => {
    const check = () => {
      const atBottom =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      setHasContentBelow(!atBottom);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    const observer = new ResizeObserver(check);
    observer.observe(document.body);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      observer.disconnect();
    };
  }, []);

  return (
    <footer
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t transition-shadow duration-300',
        className
      )}
      style={{
        boxShadow: hasContentBelow
          ? '0 -6px 24px -4px hsl(var(--turbo-teal) / 0.45), 0 0 48px -8px hsl(var(--turbo-teal) / 0.25)'
          : 'none',
      }}
    >
      <div className="container mx-auto px-4 py-3">{children}</div>
    </footer>
  );
};

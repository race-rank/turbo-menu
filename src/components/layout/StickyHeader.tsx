import React, { ReactNode, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface StickyHeaderProps {
  children: ReactNode;
  className?: string;
}

export const StickyHeader: React.FC<StickyHeaderProps> = ({ children, className }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 16);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b transition-shadow duration-300",
        className
      )}
      style={{
        boxShadow: scrolled
          ? '0 6px 24px -4px hsl(var(--turbo-teal) / 0.45), 0 0 48px -8px hsl(var(--turbo-teal) / 0.25)'
          : 'none',
      }}
    >
      <div className="container mx-auto px-4 py-3">
        {children}
      </div>
    </header>
  );
};

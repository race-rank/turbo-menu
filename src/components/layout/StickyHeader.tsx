import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StickyHeaderProps {
  children: ReactNode;
  className?: string;
}

export const StickyHeader: React.FC<StickyHeaderProps> = ({ children, className }) => {
  return (
    <header className={cn(
      "sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b",
      className
    )}>
      <div className="container mx-auto px-4 py-3">
        {children}
      </div>
    </header>
  );
};

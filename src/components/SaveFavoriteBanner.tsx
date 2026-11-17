import React from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onCancel: () => void;
}

/** Pinned above the menu at /save-favourite, so nobody thinks they are ordering. */
export const SaveFavoriteBanner: React.FC<Props> = ({ onCancel }) => (
  <div className="flex items-center gap-3 rounded-md border border-primary bg-turbo-card p-3">
    <Heart className="h-5 w-5 flex-shrink-0 text-primary" />
    <p className="flex-1 text-sm">Building a favourite - nothing will be ordered</p>
    <Button variant="ghost" size="sm" onClick={onCancel}>
      Cancel
    </Button>
  </div>
);

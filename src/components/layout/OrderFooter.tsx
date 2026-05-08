import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { StickyFooter } from './StickyFooter';

export interface BuildState {
  hookahName?: string | null;
  tobaccoLabel?: string | null;
  flavors: { name: string; percentage?: number }[];
  flavorMax: number;
  complete: boolean;
  onAdd: () => void;
}

interface OrderFooterProps {
  build?: BuildState;
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
}

export const OrderFooter: React.FC<OrderFooterProps> = ({ build, primaryAction }) => {
  const navigate = useNavigate();
  const { state, getItemCount } = useCart();

  const itemCount = getItemCount();
  const hasBuild =
    !!build && (!!build.hookahName || !!build.tobaccoLabel || build.flavors.length > 0);

  if (!hasBuild && itemCount === 0 && !primaryAction) return null;

  if (hasBuild && build) {
    return (
      <StickyFooter>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0 text-xs">
            <div className="flex items-center gap-2 text-turbo-muted truncate">
              {build.hookahName && <span className="text-turbo-text font-medium truncate">{build.hookahName}</span>}
              {build.hookahName && build.tobaccoLabel && <span>·</span>}
              {build.tobaccoLabel && <span className="truncate">{build.tobaccoLabel}</span>}
            </div>
            {build.flavors.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1 mt-1">
                {build.flavors.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 text-[11px] font-medium"
                  >
                    {f.name}
                    {typeof f.percentage === 'number' ? ` ${f.percentage}%` : ''}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-turbo-muted mt-1">Pick up to {build.flavorMax} flavors</div>
            )}
          </div>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
            onClick={build.onAdd}
            disabled={!build.complete}
          >
            Add to Cart
          </Button>
        </div>
      </StickyFooter>
    );
  }

  if (primaryAction) {
    return (
      <StickyFooter>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <span className="text-turbo-muted">{itemCount} items</span>
            <span className="text-amber-400 font-bold">{state.total} Lei</span>
          </div>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
          >
            {primaryAction.label}
          </Button>
        </div>
      </StickyFooter>
    );
  }

  return (
    <StickyFooter>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <ShoppingCart className="h-4 w-4 text-primary" />
          <span className="text-turbo-muted">{itemCount} items</span>
          <span className="text-amber-400 font-bold">{state.total} Lei</span>
        </div>
        <Button
          size="sm"
          className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
          onClick={() => navigate('/cart')}
        >
          View Cart
        </Button>
      </div>
    </StickyFooter>
  );
};

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '@/contexts/CartContext';
import { toast } from '@/hooks/use-toast';
import type { FavoriteCombo } from '@/services/favoritesService';
import { resolveReorder, type MenuSnapshot } from '@/services/reorderService';
import { TURBO_TABLE_STORAGE_KEY, isValidTableId } from '@/services/tableValidation';

interface Options {
  /** Account goes to the cart; the menu stays where it is. */
  navigateToCart?: boolean;
  addedDescription?: (favorite: FavoriteCombo) => string;
}

/**
 * Table check -> menu check -> resolveReorder -> add to cart. The price always
 * comes from the live menu, and anything deactivated is named, never silently
 * dropped. Returns whether the item was added.
 */
export const useOrderFavorite = (menu: MenuSnapshot | null, options: Options = {}) => {
  const { addItem } = useCart();
  const navigate = useNavigate();
  const { navigateToCart = false, addedDescription } = options;

  return useCallback((favorite: FavoriteCombo): boolean => {
    const tableId = localStorage.getItem(TURBO_TABLE_STORAGE_KEY);
    if (!isValidTableId(tableId)) {
      toast({
        title: 'No table selected',
        description: "Please scan your table's QR code to place an order.",
        variant: 'destructive',
      });
      return false;
    }

    if (!menu) {
      toast({ title: 'Menu still loading', description: 'Please try again in a moment.', variant: 'destructive' });
      return false;
    }

    const resolution = resolveReorder(favorite, menu, tableId);
    if (resolution.status === 'unavailable') {
      toast({
        title: 'No longer available',
        description: `${resolution.missing.join(', ')} ${resolution.missing.length > 1 ? 'are' : 'is'} no longer on the menu.`,
        variant: 'destructive',
      });
      return false;
    }

    addItem(resolution.item);
    toast({
      title: 'Added to cart',
      description: addedDescription ? addedDescription(favorite) : `${favorite.label} is in your cart.`,
    });
    if (navigateToCart) navigate('/cart');
    return true;
  }, [menu, addItem, navigate, navigateToCart, addedDescription]);
};

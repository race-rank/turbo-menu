import { useState, useEffect, useRef } from 'react';
import Autoplay from 'embla-carousel-autoplay';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Search, ShoppingCart, Trash2, Shuffle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '@/contexts/CartContext';
import { useTable } from '@/contexts/TableContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { StickyHeader } from '@/components/layout/StickyHeader';
import { OrderFooter } from '@/components/layout/OrderFooter';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { WelcomeHeader } from '@/components/WelcomeHeader';
import { successHaptic, errorHaptic } from '@/utils/haptics';
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { getHookahs, getTobaccoTypes, getFlavors, getRecommendedMixes } from '@/services/menuService';
import { DatabaseHookah, DatabaseTobaccoType, DatabaseFlavor, DatabaseRecommendedMix } from '@/types/database';

const ADDONS = [
  { key: 'hasLED' as const, label: 'LED Hookah', price: 30, image: '/led.jpeg' },
  { key: 'hasColoredWater' as const, label: 'Colored Water', price: 10, image: '/colorant.jpeg' },
  { key: 'hasAlcohol' as const, label: 'Alcohol in Vase', price: 40, image: '/alcool.jpeg' },
  { key: 'hasFruits' as const, label: 'Fruits in Vase', price: 20, image: '/fruits.jpeg' },
] as const;

const ADDON_PRICES = Object.fromEntries(ADDONS.map(a => [a.key, a.price])) as Record<typeof ADDONS[number]['key'], number>;

const Index = () => {
  const navigate = useNavigate();
  const { addItem, getItemCount } = useCart();
  const location = useLocation();
  const { setTable } = useTable();
  const [selectedHookah, setSelectedHookah] = useState<string | null>(null);
  const [selectedTobaccoType, setSelectedTobaccoType] = useState<'virginia' | 'darkblend' | 'cigarleaf' | 'mix' | null>(null);
  const [tobaccoStrength, setTobaccoStrength] = useState<number>(1);
  const [selectedFlavors, setSelectedFlavors] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRandomButtonAnimating, setIsRandomButtonAnimating] = useState(false);
  const [hookahs, setHookahs] = useState<DatabaseHookah[]>([]);
  const [tobaccoTypes, setTobaccoTypes] = useState<DatabaseTobaccoType[]>([]);
  const [flavors, setFlavors] = useState<DatabaseFlavor[]>([]);
  const [recommendedMixes, setRecommendedMixes] = useState<DatabaseRecommendedMix[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [addIce, setAddIce] = useState(false);
  const [selectedAddons, setSelectedAddons] = useState({
    hasLED: false,
    hasColoredWater: false,
    hasAlcohol: false,
    hasFruits: false
  });
  const [flavorPercentages, setFlavorPercentages] = useState<Record<string, number>>({});

  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const mixAutoplay = useRef(Autoplay({ delay: 4000, stopOnInteraction: false, stopOnMouseEnter: true }));

  useEffect(() => {
    const loadMenuData = async () => {
      try {
        setIsLoading(true);
        const [hookahsData, tobaccoData, flavorsData, mixesData] = await Promise.all([
          getHookahs(),
          getTobaccoTypes(),
          getFlavors(),
          getRecommendedMixes()
        ]);
        
        setHookahs(hookahsData);
        setTobaccoTypes(tobaccoData);
        setFlavors(flavorsData);
        setRecommendedMixes(mixesData);
      } catch (error) {
        console.error('Error loading menu data:', error);
        toast({
          title: "Error loading menu",
          description: "Failed to load menu data. Please refresh the page.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadMenuData();
  }, []);

  // Create expanded flavor list with separate entries for dual-compatible flavors
  const getExpandedFlavors = () => {
    if (!selectedTobaccoType) return [];

    const MIX_TYPES: Array<'virginia' | 'darkblend'> = ['virginia', 'darkblend'];

    let baseFlavors = selectedTobaccoType === 'mix'
      ? flavors.filter(flavor => flavor.isActive && flavor.compatibleTobaccoTypes.some(t => MIX_TYPES.includes(t as 'virginia' | 'darkblend')))
      : flavors.filter(flavor => flavor.isActive && flavor.compatibleTobaccoTypes.includes(selectedTobaccoType));

    type VariantType = 'virginia' | 'darkblend' | 'cigarleaf';
    const expandedFlavors: Array<DatabaseFlavor & { variantType?: VariantType, variantId: string }> = [];

    baseFlavors.forEach(flavor => {
      if (selectedTobaccoType === 'mix') {
        // Mix: emit one variant per supported (virginia/darkblend) compat type only
        const validTypes = flavor.compatibleTobaccoTypes.filter(t =>
          MIX_TYPES.includes(t as 'virginia' | 'darkblend')
        ) as Array<'virginia' | 'darkblend'>;
        validTypes.forEach(type => {
          expandedFlavors.push({
            ...flavor,
            variantType: type,
            variantId: `${flavor.id}-${type}`
          });
        });
        return;
      }

      if (flavor.compatibleTobaccoTypes.length > 1) {
        expandedFlavors.push({
          ...flavor,
          variantType: selectedTobaccoType as VariantType,
          variantId: `${flavor.id}-${selectedTobaccoType}`
        });
      } else {
        expandedFlavors.push({
          ...flavor,
          variantType: flavor.compatibleTobaccoTypes[0] as VariantType,
          variantId: flavor.id
        });
      }
    });

    return expandedFlavors;
  };

  const currentFlavors = getExpandedFlavors();

  const filteredFlavors = currentFlavors.filter(flavor =>
    flavor.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFlavorSelect = (variantId: string) => {
    if (selectedFlavors.includes(variantId)) {
      setSelectedFlavors(prev => prev.filter(id => id !== variantId));
    } else if (selectedFlavors.length < 3) {
      setSelectedFlavors(prev => [...prev, variantId]);
    } else {
      toast({
        title: "Maximum flavors reached",
        description: "You can select up to 3 flavors only.",
      });
    }
  };

  const isValidTableId = (tableId: string | null): boolean =>
    !!tableId && (tableId.includes('table-') || tableId.includes('bar'));

  const addMixToCart = (mixId: string) => {
    const mix = recommendedMixes.find(m => m.id === mixId);
    const tableId = localStorage.getItem('turbo-table');

    if (!isValidTableId(tableId)) {
      errorHaptic();
      toast({
        title: "No table selected",
        description: "Please scan your table's QR code to place an order.",
        variant: "destructive"
      });
      return;
    }

    if (mix && tableId) {
      addItem({
        id: `mix-${mixId}`,
        type: 'mix',
        name: mix.name,
        price: mix.price,
        image: mix.mainImage,
        table: tableId
      });
      
      successHaptic();
      
      toast({
        title: "Added to cart",
        description: `${mix.name} has been added to your cart!`,
      });

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const selectRandomFlavors = () => {
    if (!selectedTobaccoType) {
      toast({
        title: "Select tobacco type first",
        description: "Please select a tobacco type before generating random flavors.",
      });
      return;
    }
    
    setIsRandomButtonAnimating(true);
    
    // Get expanded flavors list
    const availableFlavors = currentFlavors;
    
    const shuffled = [...availableFlavors].sort(() => 0.5 - Math.random());
    const randomThree = shuffled.slice(0, Math.min(3, shuffled.length)).map(flavor => flavor.variantId);
    setSelectedFlavors(randomThree);
    
    setTimeout(() => setIsRandomButtonAnimating(false), 300);
  };

  useEffect(() => {
    setSelectedFlavors([]);
    setSearchTerm('');
  }, [selectedTobaccoType]);

  useEffect(() => {
    if (selectedTobaccoType === 'virginia') {
      setTobaccoStrength(3);
    } else if (selectedTobaccoType === 'darkblend') {
      setTobaccoStrength(8);
    } else if (selectedTobaccoType === 'cigarleaf') {
      setTobaccoStrength(9);
    } else if (selectedTobaccoType === 'mix') {
      setTobaccoStrength(5);
    }
  }, [selectedTobaccoType]);

  const FLAVOR_MIN = 10;

  const getFlavorMax = (variantId: string) => {
    const flavor = currentFlavors.find(f => f.variantId === variantId);
    return flavor?.name.toLowerCase().includes('ice') ? 40 : 70;
  };

  const snap10 = (n: number) => Math.round(n / 10) * 10;

  useEffect(() => {
    if (selectedFlavors.length === 0) {
      setFlavorPercentages({});
      return;
    }
    // Default split (multiples of 10): 1→100, 2→50/50, 3→40/30/30
    const defaults: Record<number, number[]> = {
      1: [100],
      2: [50, 50],
      3: [40, 30, 30],
    };
    const split = defaults[selectedFlavors.length] ?? [];
    const next: Record<string, number> = {};
    selectedFlavors.forEach((id, i) => {
      next[id] = split[i] ?? FLAVOR_MIN;
    });
    setFlavorPercentages(next);
  }, [selectedFlavors]);

  const handlePercentageChange = (changedId: string, newValue: number) => {
    const others = selectedFlavors.filter(id => id !== changedId);
    if (others.length === 0) return;

    const othersMinTotal = others.length * FLAVOR_MIN;
    const othersMaxTotal = others.reduce((sum, id) => sum + getFlavorMax(id), 0);
    const clampedNew = Math.max(
      FLAVOR_MIN,
      100 - othersMaxTotal,
      Math.min(getFlavorMax(changedId), 100 - othersMinTotal, snap10(newValue))
    );

    const remainingForOthers = 100 - clampedNew;
    const currentOthersSum = others.reduce((sum, id) => sum + (flavorPercentages[id] ?? FLAVOR_MIN), 0);

    const next: Record<string, number> = { [changedId]: clampedNew };
    let assigned = 0;
    others.forEach((id, i) => {
      if (i === others.length - 1) {
        next[id] = Math.max(FLAVOR_MIN, Math.min(getFlavorMax(id), remainingForOthers - assigned));
      } else {
        const proportion = currentOthersSum > 0 ? (flavorPercentages[id] ?? FLAVOR_MIN) / currentOthersSum : 1 / others.length;
        const raw = proportion * remainingForOthers;
        const snapped = snap10(raw);
        const clamped = Math.max(FLAVOR_MIN, Math.min(getFlavorMax(id), snapped));
        next[id] = clamped;
        assigned += clamped;
      }
    });

    setFlavorPercentages(next);
  };

  const getStrengthLabel = (strength: number): string => {
    if (strength <= 2) return 'Very Mild';
    if (strength <= 4) return 'Mild';
    if (strength <= 6) return 'Medium';
    if (strength <= 8) return 'Strong';
    return 'Very Strong';
  };

  const formatFlavorLabel = (flavor: ReturnType<typeof getExpandedFlavors>[number]) => {
    if (selectedTobaccoType === 'mix' && flavor.variantType) {
      return `${flavor.name} (${flavor.variantType.charAt(0).toUpperCase() + flavor.variantType.slice(1)})`;
    }
    return flavor.name;
  };

  const resolveFinalTobaccoType = (): 'virginia' | 'darkblend' | 'cigarleaf' | 'mix' | null => {
    return selectedTobaccoType;
  };

  const requestAddToCart = () => {
    const tableId = localStorage.getItem('turbo-table');
    if (!isValidTableId(tableId)) {
      errorHaptic();
      toast({
        title: "No table selected",
        description: "Please scan your table's QR code to place an order.",
        variant: "destructive"
      });
      return;
    }

    if (!selectedHookah || !selectedTobaccoType || selectedFlavors.length === 0) {
      errorHaptic();
      toast({
        title: "Incomplete selection",
        description: "Please select a hookah, tobacco type, and at least one flavor.",
      });
      return;
    }

    if (selectedTobaccoType === 'mix') {
      const hasDB = selectedFlavors.some(id => id.endsWith('-darkblend'));
      const hasV = selectedFlavors.some(id => id.endsWith('-virginia'));
      if (!hasDB || !hasV) {
        errorHaptic();
        toast({
          title: "Mix requires both types",
          description: "Pick at least 1 Darkblend and 1 Virginia flavor for a Mix hookah.",
          variant: "destructive"
        });
        return;
      }
    }

    finalizeAddToCart(addIce);
  };

  const finalizeAddToCart = (withIce: boolean) => {
    const tableId = localStorage.getItem('turbo-table');
    const selectedHookahData = hookahs.find(h => h.id === selectedHookah);
    if (!selectedHookahData || !tableId || !selectedTobaccoType) return;

    const finalTobaccoType = resolveFinalTobaccoType() ?? selectedTobaccoType;

    const selectedFlavorNames = selectedFlavors.map(variantId => {
      const flavor = currentFlavors.find(f => f.variantId === variantId);
      if (!flavor) return null;
      const showVariant = finalTobaccoType === 'mix' && flavor.variantType;
      return showVariant ? `${flavor.name} (${flavor.variantType!.charAt(0).toUpperCase() + flavor.variantType!.slice(1)})` : flavor.name;
    }).filter(Boolean) as string[];

    if (withIce && blueIceFlavor) {
      selectedFlavorNames.push(blueIceFlavor.name);
    }

    let totalPrice = selectedHookahData.price || 0;
    if (selectedAddons.hasLED) totalPrice += ADDON_PRICES.hasLED;
    if (selectedAddons.hasColoredWater) totalPrice += ADDON_PRICES.hasColoredWater;
    if (selectedAddons.hasFruits) totalPrice += ADDON_PRICES.hasFruits;
    if (selectedAddons.hasAlcohol) totalPrice += ADDON_PRICES.hasAlcohol;

    addItem({
      id: `custom-${Date.now()}`,
      type: 'custom',
      name: 'Custom Mix',
      price: totalPrice,
      image: selectedHookahData.image,
      hookah: selectedHookahData.name,
      tobaccoType: finalTobaccoType,
      tobaccoStrength: tobaccoStrength,
      flavors: selectedFlavorNames,
      flavorPercentages: selectedFlavors.length >= 2 ? flavorPercentages : undefined,
      table: tableId,
      hasLED: selectedAddons.hasLED,
      hasColoredWater: selectedAddons.hasColoredWater,
      hasAlcohol: selectedAddons.hasAlcohol,
      hasFruits: selectedAddons.hasFruits
    });

    successHaptic();
    toast({
      title: "Added to cart",
      description: withIce ? "Custom mix with ice added to your cart!" : "Custom mix has been added to your cart!",
    });

    setSelectedHookah(null);
    setSelectedTobaccoType(null);
    setSelectedFlavors([]);
    setFlavorPercentages({});

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToCart = () => {
    navigate('/cart');
  };

  const cartItemCount = getItemCount();

  const blueIceFlavor = flavors.find(flavor =>
    flavor.name.toLowerCase().includes('blue ice') ||
    flavor.name.toLowerCase().includes('ice')
  );

  const clearSelections = () => {
    setSelectedFlavors([]);
  };
  
  useEffect(() => {
    if (location.pathname.includes('table-') || location.pathname.includes('bar')) {
      setTable(location.pathname);
      localStorage.setItem('turbo-table', location.pathname);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (selectedHookah && step2Ref.current) {
      step2Ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedHookah]);

  const getHookahTobaccoType = (hookahName: string): 'virginia' | 'darkblend' | 'cigarleaf' | 'mix' | null => {
    const n = hookahName.toLowerCase();
    if (n.includes('cigar')) return 'cigarleaf';
    if (n.includes('mix')) return 'mix';
    if (n.includes('virginia')) return 'virginia';
    if (n.includes('darkblend')) return 'darkblend';
    return null;
  };

  const getHookahTypeBorder = (type: 'virginia' | 'darkblend' | 'cigarleaf' | 'mix' | null) => {
    // Return only the border color (width is controlled on selection)
    if (type === 'virginia') return 'border-emerald-500';
    if (type === 'mix') return 'border-yellow-500';
    if (type === 'darkblend') return 'border-rose-500';
    if (type === 'cigarleaf') return 'border-zinc-100';
    return 'border-border';
  };

  useEffect(() => {
    if (selectedHookah) {
      const selectedHookahData = hookahs.find(h => h.id === selectedHookah);
      if (selectedHookahData) {
        const hookahTobaccoType = getHookahTobaccoType(selectedHookahData.name);
        if (hookahTobaccoType && hookahTobaccoType !== selectedTobaccoType) {
          setSelectedTobaccoType(hookahTobaccoType);
        }
      }
    }
  }, [selectedHookah]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg">Loading menu...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <StickyHeader>
        <header className="flex items-center justify-between p-1">
          <NavigationSidebar />
          <h1 className="text-2xl font-bold tracking-wider">TURBO</h1>
          <Button variant="ghost" size="icon" className="text-turbo-text relative" onClick={navigateToCart}>
            <ShoppingCart className="h-6 w-6" />
            {cartItemCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {cartItemCount}
              </span>
            )}
          </Button>
        </header>
      </StickyHeader>
      <main className="container mx-auto px-4 py-6">
        <div className="container mx-auto px-4 py-6 space-y-8">
          <section>
            <WelcomeHeader />
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-6">Recommended Mixes</h2>
            <Carousel
              opts={{ align: 'start', loop: true }}
              plugins={[mixAutoplay.current as unknown as never]}
              className="w-full"
            >
              <CarouselContent>
                {recommendedMixes.map((mix) => (
                  <CarouselItem key={mix.id} className="basis-full md:basis-1/2 lg:basis-1/3">
                    <Card className="bg-turbo-card border-border overflow-hidden h-full">
                      <CardContent className="p-0">
                        <div className={`${mix.bgColor} p-4 text-center relative`}>
                          <img
                            src={mix.mainImage}
                            alt={mix.name}
                            className="w-24 h-28 object-cover mx-auto rounded"
                          />
                          <h3 className="text-white font-semibold mt-2">{mix.name}</h3>

                          <div className="flex justify-center gap-1 mt-2">
                            {mix.flavorImages.map((flavor, index) => (
                              <img
                                key={index}
                                src={flavor}
                                alt="flavor"
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            ))}
                          </div>
                        </div>

                        <div className="p-4 space-y-2">
                          {mix.promoText && (
                            <div className="bg-primary-100 text-secondary-800 p-2 rounded-md text-xs mb-2">
                              {mix.promoText}
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            <span className="text-lg font-bold text-turbo-text">{mix.price} Lei</span>
                            <span className="text-sm text-turbo-muted">Category</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-turbo-muted">{mix.category}</span>
                            <Button
                              size="sm"
                              className="bg-amber-600 hover:bg-amber-700 text-white"
                              onClick={() => addMixToCart(mix.id)}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="hidden md:flex" />
              <CarouselNext className="hidden md:flex" />
            </Carousel>
          </section>
          <section ref={step1Ref}>
            <h2 className="text-xl font-semibold mb-6">Step 1: Choose Hookah</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {hookahs.map((hookah) => (
                <Card 
                  key={hookah.id} 
                  className={`bg-turbo-card border ${getHookahTypeBorder(getHookahTobaccoType(hookah.name))} cursor-pointer transition-all ${
                    selectedHookah === hookah.id ? 'border-4' : 'border-2'
                  }`}
                  onClick={() => setSelectedHookah(hookah.id)}
                >
                  <CardContent className="p-4 text-center">
                    <img 
                      src={hookah.image} 
                      alt={hookah.name}
                      className="w-full h-24 object-cover mx-auto mb-2 rounded"
                    />
                    <h3 className="text-sm font-medium text-turbo-text mb-1">{hookah.name}</h3>
                    <p className="text-lg font-bold text-amber-400">{hookah.price} Lei</p>
                    {(hookah.hasLED || hookah.hasColoredWater || hookah.hasAlcohol || hookah.hasFruits) && (
                      <div className="mt-2 flex flex-wrap gap-1 justify-center">
                        {hookah.hasLED && (
                          <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">LED</span>
                        )}
                        {hookah.hasColoredWater && (
                          <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Color</span>
                        )}
                        {hookah.hasAlcohol && (
                          <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">Alcohol</span>
                        )}
                        {hookah.hasFruits && (
                          <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">Fruits</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
          
          {selectedHookah && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold mb-6">Customize Your Hookah</h2>
              <Card className="bg-turbo-card border-border">
                <CardContent className="p-6">
                  <h3 className="font-medium mb-4 text-turbo-text">Select Add-ons (Optional)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {ADDONS.map((addon) => (
                      <Card
                        key={addon.key}
                        className={`bg-turbo-card border-border cursor-pointer transition-all overflow-hidden ${
                          selectedAddons[addon.key] ? 'ring-2 ring-primary' : ''
                        }`}
                        onClick={() => setSelectedAddons(prev => ({ ...prev, [addon.key]: !prev[addon.key] }))}
                      >
                        <CardContent className="p-0">
                          <div className="relative aspect-square w-full overflow-hidden">
                            <img
                              src={addon.image}
                              alt={addon.label}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                            {selectedAddons[addon.key] && (
                              <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-lg z-20">
                                <span className="text-primary-foreground text-sm font-bold">✓</span>
                              </div>
                            )}
                          </div>
                          <div className="px-2 py-2 flex flex-col items-center text-center">
                            <h3 className="text-xs font-semibold text-turbo-text">{addon.label}</h3>
                            <span className="text-xs text-amber-400 font-bold">+{addon.price} Lei</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>
          )}
          
          {selectedHookah && selectedTobaccoType && (
            <section>
              <h2 className="text-xl font-semibold mb-6">Step 2: Tobacco Strength</h2>
              <Card className="bg-turbo-card border-border">
                <CardContent className="p-6">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Strength: {tobaccoStrength}</span>
                      <span className="text-sm font-medium text-primary">{getStrengthLabel(tobaccoStrength)}</span>
                    </div>
                    
                    <Slider
                      value={[tobaccoStrength]}
                      min={selectedTobaccoType === 'mix' ? 3 : (tobaccoTypes.find(t => t.type === selectedTobaccoType)?.strengthRange.min || 1)}
                      max={selectedTobaccoType === 'mix' ? 7 : (tobaccoTypes.find(t => t.type === selectedTobaccoType)?.strengthRange.max || 5)}
                      step={1}
                      onValueChange={(value) => setTobaccoStrength(value[0])}
                      className="w-full"
                    />
                    
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Mild</span>
                      <span>Strong</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          )}
          
          <section ref={step3Ref}>
            <h2 className="text-xl font-semibold mb-4">Step 3: Choose up to three flavors</h2>
            
            {selectedTobaccoType ? (
              <>
                <div className="relative mb-6">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-turbo-muted h-4 w-4" />
                  <Input
                    placeholder="Search for flavors here..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-muted border-border text-turbo-text placeholder:text-turbo-muted"
                  />
                </div>

                {selectedFlavors.length > 0 ? (
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <p className="text-sm text-turbo-muted">
                      Selected flavors: {selectedFlavors.length}/3
                      <span className="ml-2 text-turbo-text font-medium">
                        {selectedFlavors
                          .map(variantId => {
                            const flavor = currentFlavors.find(f => f.variantId === variantId);
                            if (!flavor) return null;
                            return formatFlavorLabel(flavor);
                          })
                          .filter(Boolean)
                          .join(', ')
                        }
                      </span>
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearSelections}
                      className="flex items-center gap-1 text-xs"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear All
                    </Button>
                  </div>
                ) : (
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <p className="text-sm text-turbo-muted">Selected flavors: 0/3</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearSelections}
                      disabled
                      className="flex items-center gap-1 text-xs"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear All
                    </Button>
                  </div>
                )}

                <div className="mb-4 flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={selectRandomFlavors}
                    className={`flex items-center gap-1 transition-transform duration-300 ${
                      isRandomButtonAnimating ? 'animate-pop' : ''
                    }`}
                  >
                    <Shuffle className="h-4 w-4" />
                    Random Mix
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {filteredFlavors
                    .filter(flavor => !blueIceFlavor || flavor.id !== blueIceFlavor.id)
                    .map((flavor) => {
                      const displayName = formatFlavorLabel(flavor);
                      const showVariantBadge = selectedTobaccoType === 'mix' && !!flavor.variantType;
                      
                      return (
                        <Card 
                          key={flavor.variantId} 
                          className={`bg-turbo-card border-border cursor-pointer transition-all ${
                            selectedFlavors.includes(flavor.variantId) ? 'ring-2 ring-primary' : ''
                          }`}
                          onClick={() => handleFlavorSelect(flavor.variantId)}
                        >
                          <CardContent className="p-4 text-center">
                            <div className="relative aspect-square w-full h-full min-h-[96px] min-w-[96px] p-1 overflow-hidden rounded shadow mx-auto mb-2">
                              <div
                                className="absolute inset-0 bg-center bg-cover rounded"
                                style={{ backgroundImage: `url(${flavor.image})`, filter: 'brightness(0.6)' }}
                              />
                              <div className="relative z-10 flex flex-col items-center justify-end h-full w-full p-1">
                                <div className="w-full bg-black/60 rounded px-2 py-1 flex flex-col items-center">
                                  <h3 className="text-xs font-semibold text-white mb-1 truncate w-full">{displayName}</h3>
                                  {showVariantBadge && flavor.variantType && (
                                    <div className="flex gap-1 mb-1">
                                      <span className={`text-[9px] px-1.5 py-0.5 text-white rounded font-semibold ${
                                        flavor.variantType === 'virginia' ? 'bg-amber-500/80' : 'bg-purple-500/80'
                                      }`}>
                                        {flavor.variantType.toUpperCase()}
                                      </span>
                                    </div>
                                  )}
                                  <div className="w-4 h-4 bg-primary rounded-full opacity-70 mb-1" />
                                  {selectedFlavors.includes(flavor.variantId) && (
                                    <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-lg">
                                      <span className="text-primary-foreground text-sm font-bold">
                                        {selectedFlavors.indexOf(flavor.variantId) + 1}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              </>
            ) : (
              <div className="py-6 text-center bg-muted/30 rounded-lg">
                <p className="text-turbo-muted">Please select a tobacco type first</p>
              </div>
            )}
          </section>

          {(selectedHookah || selectedTobaccoType || selectedFlavors.length > 0) && (
            <section className="mt-8">
              <Card className="bg-turbo-card border-border">
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Your Selection</h3>
                  {selectedHookah && (
                    <p className="text-turbo-muted mb-2">
                      Hookah: {hookahs.find(h => h.id === selectedHookah)?.name}
                    </p>
                  )}
                  {selectedTobaccoType && (
                    <>
                      <p className="text-turbo-muted mb-2">
                        Tobacco: {tobaccoTypes.find(t => t.id === selectedTobaccoType)?.name}
                      </p>
                      <p className="text-turbo-muted mb-2">
                        Strength: {tobaccoStrength} - {getStrengthLabel(tobaccoStrength)}
                      </p>
                    </>
                  )}
                  {selectedFlavors.length > 0 && (
                    <div className="mb-4">
                      {selectedFlavors.length >= 2 ? (
                        <div className="space-y-4">
                          {selectedFlavors.map(variantId => {
                            const flavor = currentFlavors.find(f => f.variantId === variantId);
                            if (!flavor) return null;
                            const label = formatFlavorLabel(flavor);
                            const pct = flavorPercentages[variantId] ?? FLAVOR_MIN;
                            return (
                              <div key={variantId}>
                                <div className="flex justify-between mb-1">
                                  <span className="text-turbo-muted text-sm">{label}</span>
                                  <span className="text-primary font-semibold text-sm">{pct}%</span>
                                </div>
                                <Slider
                                  value={[pct]}
                                  min={FLAVOR_MIN}
                                  max={getFlavorMax(variantId)}
                                  step={10}
                                  onValueChange={([val]) => handlePercentageChange(variantId, val)}
                                  className="w-full"
                                />
                              </div>
                            );
                          })}
                          <div className="flex justify-between pt-2 border-t border-border">
                            <span className="text-turbo-muted text-sm">Total</span>
                            <span className="text-white font-bold text-sm">
                              {selectedFlavors.reduce((sum, id) => sum + (flavorPercentages[id] ?? 0), 0)}%
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-turbo-muted">
                          Flavors: {selectedFlavors.map(variantId => {
                            const flavor = currentFlavors.find(f => f.variantId === variantId);
                            if (!flavor) return '';
                            return formatFlavorLabel(flavor);
                          }).join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                  {selectedTobaccoType === 'mix' && selectedFlavors.length > 0 && (() => {
                    const hasDB = selectedFlavors.some(id => id.endsWith('-darkblend'));
                    const hasV = selectedFlavors.some(id => id.endsWith('-virginia'));
                    if (hasDB && hasV) return null;
                    const missing = !hasDB ? 'Darkblend' : 'Virginia';
                    return (
                      <div className="mb-3 p-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 text-xs text-yellow-200">
                        Mix needs both Darkblend and Virginia. Add at least 1 {missing} flavor.
                      </div>
                    );
                  })()}
                  <div className="flex items-center justify-between mb-3 p-3 rounded-md border border-border bg-muted/30">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-turbo-text">Add Ice</span>
                      <span className="text-xs text-turbo-muted">Refreshing chill on top of your mix</span>
                    </div>
                    <Switch checked={addIce} onCheckedChange={setAddIce} />
                  </div>
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={requestAddToCart}
                  >
                    Add Custom Mix to Cart
                  </Button>
                </CardContent>
              </Card>
            </section>
          )}
        </div>
      </main>
      <OrderFooter
        build={{
          hookahName: selectedHookah ? hookahs.find(h => h.id === selectedHookah)?.name ?? null : null,
          tobaccoLabel: selectedTobaccoType
            ? `${tobaccoTypes.find(t => t.id === selectedTobaccoType)?.name ?? selectedTobaccoType} · ${getStrengthLabel(tobaccoStrength)}`
            : null,
          flavors: selectedFlavors.map(variantId => {
            const flavor = currentFlavors.find(f => f.variantId === variantId);
            const name = flavor ? formatFlavorLabel(flavor) : variantId;
            return {
              name,
              percentage: selectedFlavors.length >= 2 ? flavorPercentages[variantId] : undefined,
            };
          }),
          flavorMax: 3,
          complete: !!selectedHookah && !!selectedTobaccoType && selectedFlavors.length > 0,
          onAdd: requestAddToCart,
        }}
      />
    </div>
  );
};

export default Index;
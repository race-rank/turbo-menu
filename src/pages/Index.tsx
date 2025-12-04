import { useState, useEffect, useRef } from 'react';
import { Search, ShoppingCart, Trash2, Shuffle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '@/contexts/CartContext';
import { useTable } from '@/contexts/TableContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { StickyHeader } from '@/components/layout/StickyHeader';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { WelcomeHeader } from '@/components/WelcomeHeader';
import { successHaptic, errorHaptic } from '@/utils/haptics';
import { Slider } from "@/components/ui/slider";
import { getHookahs, getTobaccoTypes, getFlavors, getRecommendedMixes } from '@/services/menuService';
import { DatabaseHookah, DatabaseTobaccoType, DatabaseFlavor, DatabaseRecommendedMix } from '@/types/database';

const Index = () => {
  const navigate = useNavigate();
  const { addItem, getItemCount } = useCart();
  const location = useLocation();
  const { setTable } = useTable();
  const [selectedHookah, setSelectedHookah] = useState<string | null>(null);
  const [selectedTobaccoType, setSelectedTobaccoType] = useState<'blond' | 'dark' | null>(null);
  const [tobaccoStrength, setTobaccoStrength] = useState<number>(1);
  const [selectedFlavors, setSelectedFlavors] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRandomButtonAnimating, setIsRandomButtonAnimating] = useState(false);
  const [hookahs, setHookahs] = useState<DatabaseHookah[]>([]);
  const [tobaccoTypes, setTobaccoTypes] = useState<DatabaseTobaccoType[]>([]);
  const [flavors, setFlavors] = useState<DatabaseFlavor[]>([]);
  const [recommendedMixes, setRecommendedMixes] = useState<DatabaseRecommendedMix[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasBlueIce, setHasBlueIce] = useState(false);

  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);

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

  const currentFlavors = selectedTobaccoType 
    ? flavors.filter(flavor => flavor.isActive && flavor.compatibleTobaccoTypes.includes(selectedTobaccoType))
    : [];

  const filteredFlavors = currentFlavors.filter(flavor =>
    flavor.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFlavorSelect = (flavorId: string) => {
    if (selectedFlavors.includes(flavorId)) {
      setSelectedFlavors(prev => prev.filter(id => id !== flavorId));
    } else if (selectedFlavors.length < 3) {
      setSelectedFlavors(prev => [...prev, flavorId]);
    } else {
      toast({
        title: "Maximum flavors reached",
        description: "You can select up to 3 flavors only.",
      });
    }
  };

  const addMixToCart = (mixId: string) => {
    const mix = recommendedMixes.find(m => m.id === mixId);
    const tableId = localStorage.getItem('turbo-table');
    
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
    
    const availableFlavors = flavors.filter(flavor => flavor.compatibleTobaccoTypes.includes(selectedTobaccoType));
    const shuffled = [...availableFlavors].sort(() => 0.5 - Math.random());
    const randomThree = shuffled.slice(0, Math.min(3, shuffled.length)).map(flavor => flavor.id);
    setSelectedFlavors(randomThree);
    
    setTimeout(() => setIsRandomButtonAnimating(false), 300);
  };

  useEffect(() => {
    setSelectedFlavors([]);
    setSearchTerm('');
  }, [selectedTobaccoType]);

  useEffect(() => {
    if (selectedTobaccoType === 'blond') {
      setTobaccoStrength(3);
    } else if (selectedTobaccoType === 'dark') {
      setTobaccoStrength(8);
    }
  }, [selectedTobaccoType]);

  const getStrengthLabel = (strength: number): string => {
    if (strength <= 2) return 'Very Mild';
    if (strength <= 4) return 'Mild';
    if (strength <= 6) return 'Medium';
    if (strength <= 8) return 'Strong';
    return 'Very Strong';
  };

  const addCustomMixToCart = () => {
    if (!selectedHookah || !selectedTobaccoType || selectedFlavors.length === 0) {
      errorHaptic();
      toast({
        title: "Incomplete selection",
        description: "Please select a hookah, tobacco type, and at least one flavor.",
      });
      return;
    }

    const selectedHookahData = hookahs.find(h => h.id === selectedHookah);
    const selectedFlavorNames = selectedFlavors.map(id => 
      currentFlavors.find(f => f.id === id)?.name
    ).filter(Boolean);

    const tableId = localStorage.getItem('turbo-table');

    if (selectedHookahData && tableId) {
      addItem({
        id: `custom-${Date.now()}`,
        type: 'custom',
        name: 'Custom Mix',
        price: selectedHookahData.price,
        image: selectedHookahData.image,
        hookah: selectedHookahData.name,
        tobaccoType: selectedTobaccoType,
        tobaccoStrength: tobaccoStrength,
        flavors: selectedFlavorNames as string[],
        table: tableId
      });
      
      successHaptic();
      
      toast({
        title: "Added to cart",
        description: "Custom mix has been added to your cart!",
      });
      
      setSelectedHookah(null);
      setSelectedTobaccoType(null);
      setSelectedFlavors([]);

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const navigateToCart = () => {
    navigate('/cart');
  };

  const cartItemCount = getItemCount();

  const blueIceFlavor = flavors.find(flavor => 
    flavor.name.toLowerCase().includes('blue ice') || 
    flavor.name.toLowerCase().includes('ice')
  );

  const handleBlueIceToggle = () => {
    if (!blueIceFlavor) return;
    
    if (hasBlueIce) {
      setSelectedFlavors(prev => prev.filter(id => id !== blueIceFlavor.id));
      setHasBlueIce(false);
    } else {
      // Blue ice doesn't count towards the 3-flavor limit
      setSelectedFlavors(prev => [...prev, blueIceFlavor.id]);
      setHasBlueIce(true);
    }
  };

  useEffect(() => {
    if (blueIceFlavor) {
      setHasBlueIce(selectedFlavors.includes(blueIceFlavor.id));
    }
  }, [selectedFlavors, blueIceFlavor]);

  const clearSelections = () => {
    setSelectedFlavors([]);
    setHasBlueIce(false);
  };
  
  useEffect(() => {
    if (location.pathname.includes('table-') || location.pathname.includes('bar')) {
      setTable(location.pathname);
      localStorage.setItem('turbo-table', location.pathname);
    } else {
      localStorage.setItem('turbo-table', '');
    }
  }, [location.pathname]);

  useEffect(() => {
    if (selectedHookah && step2Ref.current) {
      step2Ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedHookah]);

  useEffect(() => {
    if (selectedTobaccoType && step3Ref.current) {
      step3Ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedTobaccoType]);

  const getHookahTobaccoType = (hookahName: string): 'blond' | 'dark' | null => {
    if (hookahName.toLowerCase().includes('blond')) return 'blond';
    if (hookahName.toLowerCase().includes('dark')) return 'dark';
    return null;
  };

  const getAvailableTobaccoTypes = () => {
    if (!selectedHookah) return tobaccoTypes;
    
    const selectedHookahData = hookahs.find(h => h.id === selectedHookah);
    if (!selectedHookahData) return tobaccoTypes;
    
    const hookahTobaccoType = getHookahTobaccoType(selectedHookahData.name);
    if (!hookahTobaccoType) return tobaccoTypes;
    
    return tobaccoTypes.filter(tobacco => tobacco.type === hookahTobaccoType);
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
    <div className="min-h-screen">
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recommendedMixes.map((mix) => (
                <Card key={mix.id} className="bg-turbo-card border-border overflow-hidden">
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
              ))}
            </div>
          </section>
          <section ref={step1Ref}>
            <h2 className="text-xl font-semibold mb-6">Step 1: Choose Hookah</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {hookahs.map((hookah) => (
                <Card 
                  key={hookah.id} 
                  className={`bg-turbo-card border-border cursor-pointer transition-all ${
                    selectedHookah === hookah.id ? 'ring-2 ring-primary' : ''
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
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
          <section ref={step2Ref}>
            <h2 className="text-xl font-semibold mb-6">Step 2: Choose Tobacco Type</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {getAvailableTobaccoTypes().map((tobacco) => (
                <Card 
                  key={tobacco.id} 
                  className={`bg-turbo-card border-border cursor-pointer transition-all ${
                    selectedTobaccoType === tobacco.type ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setSelectedTobaccoType(tobacco.type)}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0">
                      <img 
                        src={tobacco.image} 
                        alt={tobacco.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-turbo-text mb-1">{tobacco.name}</h3>
                      <p className="text-sm text-turbo-muted">{tobacco.description}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {selectedTobaccoType && (
              <div className="mt-6 p-4 bg-turbo-card border border-border rounded-lg">
                <h3 className="font-medium mb-4">Select Tobacco Strength</h3>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Strength: {tobaccoStrength}</span>
                    <span className="text-sm font-medium text-primary">{getStrengthLabel(tobaccoStrength)}</span>
                  </div>
                  
                  <Slider
                    value={[tobaccoStrength]}
                    min={tobaccoTypes.find(t => t.type === selectedTobaccoType)?.strengthRange.min || 1}
                    max={tobaccoTypes.find(t => t.type === selectedTobaccoType)?.strengthRange.max || 5}
                    step={1}
                    onValueChange={(value) => setTobaccoStrength(value[0])}
                    className="w-full"
                  />
                  
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Mild</span>
                    <span>Strong</span>
                  </div>
                </div>
              </div>
            )}
          </section>
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
                      Selected flavors: {selectedFlavors.filter(id => !blueIceFlavor || id !== blueIceFlavor.id).length}/3
                      <span className="ml-2 text-turbo-text font-medium">
                        {selectedFlavors
                          .filter(id => {
                            console.log(id, blueIceFlavor);
                            return !blueIceFlavor || id !== blueIceFlavor.id
                          })
                          .map(id => currentFlavors.find(f => f.id === id)?.name)
                          .filter(Boolean)
                          .join(', ')
                        }
                      </span>
                      {hasBlueIce && <span className="ml-2 text-blue-400">+ Ice</span>}
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
                    <p className="text-sm text-turbo-muted">
                      Selected flavors: 0/3
                      {hasBlueIce && <span className="ml-2 text-blue-400">+ Ice</span>}
                      <span className="ml-2 text-turbo-text font-medium">
                        {hasBlueIce && blueIceFlavor ? blueIceFlavor.name : ''}
                      </span>
                    </p>
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
                  
                  {blueIceFlavor && (
                    <Button 
                      variant={hasBlueIce ? "default" : "outline"}
                      size="sm"
                      onClick={handleBlueIceToggle}
                      className="flex items-center gap-1"
                    >
                      {hasBlueIce ? "Remove Ice" : "Add Ice"}
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {filteredFlavors
                    .filter(flavor => !blueIceFlavor || flavor.id !== blueIceFlavor.id)
                    .map((flavor) => (
                    <Card 
                      key={flavor.id} 
                      className={`bg-turbo-card border-border cursor-pointer transition-all ${
                        selectedFlavors.includes(flavor.id) ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => handleFlavorSelect(flavor.id)}
                    >
                      <CardContent className="p-4 text-center">
                        <div className="relative aspect-square w-full h-full min-h-[96px] min-w-[96px] p-1 overflow-hidden rounded shadow mx-auto mb-2">
                          <div
                            className="absolute inset-0 bg-center bg-cover rounded"
                            style={{ backgroundImage: `url(${flavor.image})`, filter: 'brightness(0.6)' }}
                          />
                          <div className="relative z-10 flex flex-col items-center justify-end h-full w-full p-1">
                            <div className="w-full bg-black/60 rounded px-2 py-1 flex flex-col items-center">
                              <h3 className="text-xs font-semibold text-white mb-1 truncate w-full">{flavor.name}</h3>
                              <div className="w-4 h-4 bg-primary rounded-full opacity-70 mb-1" />
                              {selectedFlavors.includes(flavor.id) && (
                                <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-lg">
                                  <span className="text-primary-foreground text-sm font-bold">
                                    {selectedFlavors.indexOf(flavor.id) + 1}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
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
                    <p className="text-turbo-muted mb-4">
                      Flavors: {selectedFlavors.map(id => 
                        currentFlavors.find(f => f.id === id)?.name
                      ).join(', ')}
                    </p>
                  )}
                  <Button 
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" 
                    onClick={addCustomMixToCart}
                  >
                    Add Custom Mix to Cart
                  </Button>
                </CardContent>
              </Card>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
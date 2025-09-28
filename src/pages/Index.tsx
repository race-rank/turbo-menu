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

import hookah1 from '@/assets/hookah-1.jpg';
import hookah2 from '@/assets/hookah-2.jpg';
import hookah3 from '@/assets/hookah-3.jpg';
import appleFlavor from '@/assets/apple-flavor.jpg';
import mintFlavor from '@/assets/mint-flavor.jpg';
import berryFlavor from '@/assets/berry-flavor.jpg';

const Index = () => {
  const navigate = useNavigate();
  const { addItem, getItemCount } = useCart();
  const location = useLocation();
  const { setTable } = useTable();
  const [selectedHookah, setSelectedHookah] = useState<number | null>(null);
  const [selectedTobaccoType, setSelectedTobaccoType] = useState<'blond' | 'dark' | null>(null);
  const [tobaccoStrength, setTobaccoStrength] = useState<number>(1);
  const [selectedFlavors, setSelectedFlavors] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRandomButtonAnimating, setIsRandomButtonAnimating] = useState(false);

  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);

  const recommendedMixes = [
    {
      id: 1,
      name: 'Turbo Mix',
      price: 70,
      category: 'Fresh',
      mainImage: hookah1,
      flavors: [appleFlavor, mintFlavor, berryFlavor],
      bgColor: 'bg-teal-500',
      promoText: "Oferta Turbo Mix - Daca ghicesti aromele narghilelei, primesti 20% reducere!"
    },
    {
      id: 2,
      name: 'Balkan Mix',
      price: 70,
      category: 'Fresh',
      mainImage: hookah2,
      flavors: [mintFlavor, appleFlavor, berryFlavor],
      bgColor: 'bg-teal-500'
    },
    {
      id: 3,
      name: 'Cactus Blast',
      price: 70,
      category: 'Fresh',
      mainImage: hookah3,
      flavors: [berryFlavor, mintFlavor, appleFlavor],
      bgColor: 'bg-teal-500'
    }
  ];

  const hookahs = [
    { id: 1, name: 'Maturbo X', price: 70, image: hookah1 },
    { id: 2, name: 'Project Helios', price: 90, image: hookah2 },
    { id: 3, name: 'Maturbo Odyssey', price: 90, image: hookah3 },
    { id: 4, name: 'Maturbo Skytech', price: 90, image: hookah1 },
    { id: 5, name: 'Maturbo Dragon', price: 120, image: hookah2 },
    { id: 6, name: 'Maturbo Rose', price: 120, image: hookah3 }
  ];

  const tobaccoTypes = [
    { 
      id: 'blond', 
      name: 'Blond Tobacco', 
      description: 'Lighter, smoother smoke with vibrant flavor profiles',
      image: appleFlavor
    },
    { 
      id: 'dark', 
      name: 'Dark Tobacco', 
      description: 'Stronger, richer smoke with intense flavor notes',
      image: berryFlavor
    }
  ];

  // Flavors organized by tobacco type
  const flavorsByType = {
    blond: [
      { id: 1, name: 'Aloe Drink', image: appleFlavor },
      { id: 2, name: 'American Beer', image: berryFlavor },
      { id: 3, name: 'Ananas Shock', image: mintFlavor },
      { id: 4, name: 'Aperol Spritz', image: appleFlavor },
      { id: 5, name: 'Apple Hook', image: appleFlavor },
      { id: 6, name: 'Apple Shock', image: appleFlavor },
      { id: 9, name: 'Banana Milkshake', image: berryFlavor },
      { id: 12, name: 'Basil Blast', image: mintFlavor },
      { id: 14, name: 'Bubble Gum', image: mintFlavor },
      { id: 16, name: 'Coconut', image: appleFlavor },
    ],
    dark: [
      { id: 7, name: 'Apple Squirt', image: appleFlavor },
      { id: 8, name: 'Banana', image: berryFlavor },
      { id: 10, name: 'Banana Way', image: berryFlavor },
      { id: 11, name: 'Barberry Shock', image: berryFlavor },
      { id: 13, name: 'Blueberry', image: berryFlavor },
      { id: 15, name: 'Cherry', image: berryFlavor },
      { id: 17, name: 'Cola', image: berryFlavor },
      { id: 18, name: 'Grape', image: berryFlavor }
    ]
  };

  const currentFlavors = selectedTobaccoType ? flavorsByType[selectedTobaccoType] : [];

  const filteredFlavors = currentFlavors.filter(flavor =>
    flavor.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFlavorSelect = (flavorId: number) => {
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

  const addMixToCart = (mixId: number) => {
    const mix = recommendedMixes.find(m => m.id === mixId);
    const tableId = localStorage.getItem('turbo-table');
    console.log(tableId);
    if (mix && tableId) {
      addItem({
        id: `mix-${mixId}`,
        type: 'mix',
        name: mix.name,
        price: mix.price,
        image: mix.mainImage,
        table: tableId
      });
      
      // Trigger haptic feedback for successful add
      successHaptic();
      
      toast({
        title: "Added to cart",
        description: `${mix.name} has been added to your cart!`,
      });
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
    
    const availableFlavors = flavorsByType[selectedTobaccoType];
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
    console.log(tableId);

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
    }
  };

  const navigateToCart = () => {
    navigate('/cart');
  };

  const cartItemCount = getItemCount();

  const clearSelections = () => {
    setSelectedFlavors([]);
  };
  
  useEffect(() => {
    // temporary fix
    // localStorage.setItem('turbo-table', 'table-2');
    if (location.pathname.includes('table-') || location.pathname.includes('bar')) {
      setTable(location.pathname);
      localStorage.setItem('turbo-table', location.pathname);
    } else {
      localStorage.setItem('turbo-table', '');
    }
  }, [location.pathname]);

  // Scroll to next step when a step is completed
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
                        {mix.flavors.map((flavor, index) => (
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
              {hookahs.sort((a, b) => b.price - a.price).map((hookah) => (
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
              {tobaccoTypes.map((tobacco) => (
                <Card 
                  key={tobacco.id} 
                  className={`bg-turbo-card border-border cursor-pointer transition-all ${
                    selectedTobaccoType === tobacco.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setSelectedTobaccoType(tobacco.id as 'blond' | 'dark')}
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
                    min={selectedTobaccoType === 'blond' ? 1 : 6}
                    max={selectedTobaccoType === 'blond' ? 5 : 10}
                    step={1}
                    onValueChange={(value) => setTobaccoStrength(value[0])}
                    className="w-full"
                  />
                  
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{selectedTobaccoType === 'blond' ? 'Mild' : 'Medium'}</span>
                    <span>{selectedTobaccoType === 'blond' ? 'Medium' : 'Strong'}</span>
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
                      Selected flavors: {selectedFlavors.length}/3
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

                <div className="mb-4">
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
                  {filteredFlavors.map((flavor) => (
                    <Card 
                      key={flavor.id} 
                      className={`bg-turbo-card border-border cursor-pointer transition-all ${
                        selectedFlavors.includes(flavor.id) ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => handleFlavorSelect(flavor.id)}
                    >
                      <CardContent className="p-4 text-center">
                        <div className="relative">
                          <img 
                            src={flavor.image} 
                            alt={flavor.name}
                            className="w-full h-16 object-cover mx-auto mb-2 rounded"
                          />
                          {selectedFlavors.includes(flavor.id) && (
                            <div className="absolute inset-0 bg-primary/20 rounded flex items-center justify-center">
                              <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                                <span className="text-primary-foreground text-sm font-bold">
                                  {selectedFlavors.indexOf(flavor.id) + 1}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                        <h3 className="text-xs font-medium text-turbo-text">{flavor.name}</h3>
                        <div className="mt-2">
                          <div className="w-4 h-4 bg-primary rounded-full mx-auto opacity-50" />
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
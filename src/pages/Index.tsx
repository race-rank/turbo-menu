import { useState } from 'react';
import { Menu, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';

// Import AI-generated images
import hookah1 from '@/assets/hookah-1.jpg';
import hookah2 from '@/assets/hookah-2.jpg';
import hookah3 from '@/assets/hookah-3.jpg';
import appleFlavor from '@/assets/apple-flavor.jpg';
import mintFlavor from '@/assets/mint-flavor.jpg';
import berryFlavor from '@/assets/berry-flavor.jpg';

const Index = () => {
  const [selectedHookah, setSelectedHookah] = useState<number | null>(null);
  const [selectedFlavors, setSelectedFlavors] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Recommended mixes data
  const recommendedMixes = [
    {
      id: 1,
      name: 'Rich Forest',
      price: '70 Lei',
      category: 'Fresh',
      mainImage: hookah1,
      flavors: [appleFlavor, mintFlavor, berryFlavor],
      bgColor: 'bg-teal-500'
    },
    {
      id: 2,
      name: 'Balkan Mix',
      price: '70 Lei',
      category: 'Fresh',
      mainImage: hookah2,
      flavors: [mintFlavor, appleFlavor, berryFlavor],
      bgColor: 'bg-teal-500'
    },
    {
      id: 3,
      name: 'Cactus Blast',
      price: '70 Lei',
      category: 'Fresh',
      mainImage: hookah3,
      flavors: [berryFlavor, mintFlavor, appleFlavor],
      bgColor: 'bg-teal-500'
    }
  ];

  // Hookah products data
  const hookahs = [
    { id: 1, name: 'Maklaud X', price: '70 Lei', image: hookah1 },
    { id: 2, name: 'Project Helios', price: '90 Lei', image: hookah2 },
    { id: 3, name: 'Maklaud Odyssey', price: '90 Lei', image: hookah3 },
    { id: 4, name: 'Maklaud Skytech', price: '90 Lei', image: hookah1 },
    { id: 5, name: 'Maklaud Dragon', price: '120 Lei', image: hookah2 },
    { id: 6, name: 'Maklaud Rose', price: '120 Lei', image: hookah3 }
  ];

  // Flavor data
  const flavors = [
    { id: 1, name: 'Aloe Drink', image: appleFlavor },
    { id: 2, name: 'American Beer', image: berryFlavor },
    { id: 3, name: 'Ananas Shock', image: mintFlavor },
    { id: 4, name: 'Aperol Spritz', image: appleFlavor },
    { id: 5, name: 'Apple Hook', image: appleFlavor },
    { id: 6, name: 'Apple Shock', image: appleFlavor },
    { id: 7, name: 'Apple Squirt', image: appleFlavor },
    { id: 8, name: 'Banana', image: berryFlavor },
    { id: 9, name: 'Banana Milkshake', image: berryFlavor },
    { id: 10, name: 'Banana Way', image: berryFlavor },
    { id: 11, name: 'Barberry Shock', image: berryFlavor },
    { id: 12, name: 'Basil Blast', image: mintFlavor },
    { id: 13, name: 'Blueberry', image: berryFlavor },
    { id: 14, name: 'Bubble Gum', image: mintFlavor },
    { id: 15, name: 'Cherry', image: berryFlavor },
    { id: 16, name: 'Coconut', image: appleFlavor },
    { id: 17, name: 'Cola', image: berryFlavor },
    { id: 18, name: 'Grape', image: berryFlavor }
  ];

  const filteredFlavors = flavors.filter(flavor =>
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
    toast({
      title: "Added to cart",
      description: "Mix has been added to your cart!",
    });
  };

  return (
    <div className="min-h-screen bg-klaud-dark text-klaud-text">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="icon" className="text-klaud-text">
          <Menu className="h-6 w-6" />
        </Button>
        
        <h1 className="text-2xl font-bold tracking-wider">KLAUD</h1>
        
        <div className="w-10" />
      </header>

      <div className="container mx-auto px-4 py-6 space-y-8">
        {/* Recommended Mixes */}
        <section>
          <h2 className="text-xl font-semibold mb-6">Recommended Mixes</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recommendedMixes.map((mix) => (
              <Card key={mix.id} className="bg-klaud-card border-border overflow-hidden">
                <CardContent className="p-0">
                  <div className={`${mix.bgColor} p-4 text-center relative`}>
                    <img 
                      src={mix.mainImage} 
                      alt={mix.name}
                      className="w-24 h-28 object-cover mx-auto rounded"
                    />
                    <h3 className="text-white font-semibold mt-2">{mix.name}</h3>
                    
                    {/* Flavor indicators */}
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
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-klaud-text">{mix.price}</span>
                      <span className="text-sm text-klaud-muted">Category</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-klaud-muted">{mix.category}</span>
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

        {/* Step 1: Choose Hookah */}
        <section>
          <h2 className="text-xl font-semibold mb-6">Step 1: Choose Hookah</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {hookahs.map((hookah) => (
              <Card 
                key={hookah.id} 
                className={`bg-klaud-card border-border cursor-pointer transition-all ${
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
                  <h3 className="text-sm font-medium text-klaud-text mb-1">{hookah.name}</h3>
                  <p className="text-lg font-bold text-amber-400">{hookah.price}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Step 2: Choose up to three flavors */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Step 2: Choose up to three flavors</h2>
          
          {/* Search bar */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-klaud-muted h-4 w-4" />
            <Input
              placeholder="Search for flavors here..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-muted border-border text-klaud-text placeholder:text-klaud-muted"
            />
          </div>

          {/* Selected flavors indicator */}
          {selectedFlavors.length > 0 && (
            <div className="mb-4">
              <p className="text-sm text-klaud-muted mb-2">
                Selected flavors: {selectedFlavors.length}/3
              </p>
            </div>
          )}

          {/* Flavors grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredFlavors.map((flavor) => (
              <Card 
                key={flavor.id} 
                className={`bg-klaud-card border-border cursor-pointer transition-all ${
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
                  <h3 className="text-xs font-medium text-klaud-text">{flavor.name}</h3>
                  <div className="mt-2">
                    <div className="w-4 h-4 bg-primary rounded-full mx-auto opacity-50" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Order Summary */}
        {(selectedHookah || selectedFlavors.length > 0) && (
          <section className="mt-8">
            <Card className="bg-klaud-card border-border">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-4">Your Selection</h3>
                {selectedHookah && (
                  <p className="text-klaud-muted mb-2">
                    Hookah: {hookahs.find(h => h.id === selectedHookah)?.name}
                  </p>
                )}
                {selectedFlavors.length > 0 && (
                  <p className="text-klaud-muted mb-4">
                    Flavors: {selectedFlavors.map(id => 
                      flavors.find(f => f.id === id)?.name
                    ).join(', ')}
                  </p>
                )}
                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                  Add Custom Mix to Cart
                </Button>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
};

export default Index;
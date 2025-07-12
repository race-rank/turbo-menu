
import { useState } from 'react';
import { ShoppingCart, Search, Filter, Star, Heart, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';

const Index = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cartItems, setCartItems] = useState<number[]>([]);
  const [wishlist, setWishlist] = useState<number[]>([]);

  const categories = [
    { id: 'all', name: 'All Products', count: 24 },
    { id: 'traditional', name: 'Traditional', count: 8 },
    { id: 'modern', name: 'Modern', count: 10 },
    { id: 'premium', name: 'Premium', count: 6 }
  ];

  const products = [
    {
      id: 1,
      name: 'Royal Sultan Traditional',
      category: 'traditional',
      price: 299,
      originalPrice: 349,
      rating: 4.8,
      reviews: 124,
      image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop&crop=center',
      description: 'Handcrafted traditional hookah with intricate brass details',
      inStock: true,
      isNew: false,
      tags: ['brass', 'handcrafted', 'large']
    },
    {
      id: 2,
      name: 'Crystal Elite Modern',
      category: 'modern',
      price: 449,
      originalPrice: 499,
      rating: 4.9,
      reviews: 89,
      image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop&crop=center',
      description: 'Contemporary design with LED lighting and crystal base',
      inStock: true,
      isNew: true,
      tags: ['LED', 'crystal', 'modern']
    },
    {
      id: 3,
      name: 'Pharaoh Gold Premium',
      category: 'premium',
      price: 699,
      originalPrice: 799,
      rating: 5.0,
      reviews: 45,
      image: 'https://images.unsplash.com/photo-1578318749666-94c1dd75f3e7?w=400&h=400&fit=crop&crop=center',
      description: 'Luxury gold-plated hookah with Egyptian hieroglyphs',
      inStock: true,
      isNew: false,
      tags: ['gold', 'luxury', 'egyptian']
    },
    {
      id: 4,
      name: 'Mystic Blue Traditional',
      category: 'traditional',
      price: 189,
      originalPrice: 229,
      rating: 4.6,
      reviews: 203,
      image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop&crop=center',
      description: 'Classic blue ceramic base with silver accents',
      inStock: false,
      isNew: false,
      tags: ['ceramic', 'blue', 'classic']
    },
    {
      id: 5,
      name: 'Neon Fusion Modern',
      category: 'modern',
      price: 359,
      originalPrice: 399,
      rating: 4.7,
      reviews: 156,
      image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop&crop=center',
      description: 'RGB lighting with smartphone app control',
      inStock: true,
      isNew: true,
      tags: ['RGB', 'app-control', 'futuristic']
    },
    {
      id: 6,
      name: 'Diamond Empress Premium',
      category: 'premium',
      price: 899,
      originalPrice: 999,
      rating: 4.9,
      reviews: 67,
      image: 'https://images.unsplash.com/photo-1578318749666-94c1dd75f3e7?w=400&h=400&fit=crop&crop=center',
      description: 'Swarovski crystal embellishments with platinum finish',
      inStock: true,
      isNew: false,
      tags: ['swarovski', 'platinum', 'exclusive']
    }
  ];

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (productId: number) => {
    setCartItems(prev => [...prev, productId]);
    toast({
      title: "Added to Cart",
      description: "Item has been added to your cart successfully!",
    });
  };

  const toggleWishlist = (productId: number) => {
    setWishlist(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/50 backdrop-blur-md border-b border-gold-500/20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                HookahRoyale
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search hookahs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64 bg-white/10 border-white/20 text-white placeholder:text-gray-400"
                />
              </div>
              
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 relative">
                <Heart className="h-5 w-5" />
                {wishlist.length > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-red-500">
                    {wishlist.length}
                  </Badge>
                )}
              </Button>
              
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 relative">
                <ShoppingCart className="h-5 w-5" />
                {cartItems.length > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-amber-500">
                    {cartItems.length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-900/50 to-blue-900/50" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <h2 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 bg-clip-text text-transparent animate-fade-in">
              Premium Hookah Collection
            </h2>
            <p className="text-xl text-gray-300 mb-8 animate-fade-in">
              Discover the finest selection of traditional and modern hookahs, crafted for the ultimate smoking experience
            </p>
            <Button size="lg" className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white px-8 py-3 text-lg animate-scale-in">
              Explore Collection
            </Button>
          </div>
        </div>
        
        {/* Floating Elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full opacity-20 animate-pulse" />
        <div className="absolute bottom-20 right-10 w-32 h-32 bg-gradient-to-r from-purple-400 to-pink-500 rounded-full opacity-10 animate-pulse" />
      </section>

      {/* Filters */}
      <section className="py-8 border-b border-white/10">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5 text-gray-400" />
              <span className="text-gray-300">Categories:</span>
              <div className="flex flex-wrap gap-2">
                {categories.map(category => (
                  <Button
                    key={category.id}
                    variant={selectedCategory === category.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(category.id)}
                    className={selectedCategory === category.id 
                      ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white" 
                      : "border-white/20 text-gray-300 hover:bg-white/10"
                    }
                  >
                    {category.name} ({category.count})
                  </Button>
                ))}
              </div>
            </div>
            
            <div className="text-gray-400">
              Showing {filteredProducts.length} products
            </div>
          </div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProducts.map(product => (
              <Card key={product.id} className="bg-white/5 border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all duration-300 group hover:scale-105">
                <CardContent className="p-0">
                  <div className="relative overflow-hidden rounded-t-lg">
                    <img 
                      src={product.image} 
                      alt={product.name}
                      className="w-full h-64 object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    
                    {/* Overlays */}
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                      {product.isNew && (
                        <Badge className="bg-green-500 text-white">NEW</Badge>
                      )}
                      {!product.inStock && (
                        <Badge className="bg-red-500 text-white">OUT OF STOCK</Badge>
                      )}
                      {product.originalPrice > product.price && (
                        <Badge className="bg-amber-500 text-white">
                          -{Math.round((1 - product.price / product.originalPrice) * 100)}%
                        </Badge>
                      )}
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-4 right-4 bg-black/50 text-white hover:bg-black/70"
                      onClick={() => toggleWishlist(product.id)}
                    >
                      <Heart 
                        className={`h-4 w-4 ${wishlist.includes(product.id) ? 'fill-red-500 text-red-500' : ''}`} 
                      />
                    </Button>
                  </div>
                  
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="border-amber-500/50 text-amber-400">
                        {product.category}
                      </Badge>
                      <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="text-sm text-gray-300">{product.rating}</span>
                        <span className="text-xs text-gray-500">({product.reviews})</span>
                      </div>
                    </div>
                    
                    <h3 className="text-xl font-semibold text-white mb-2">{product.name}</h3>
                    <p className="text-gray-400 text-sm mb-4">{product.description}</p>
                    
                    <div className="flex flex-wrap gap-1 mb-4">
                      {product.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs bg-white/10 text-gray-300">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
                
                <CardFooter className="p-6 pt-0 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl font-bold text-amber-400">${product.price}</span>
                    {product.originalPrice > product.price && (
                      <span className="text-lg text-gray-500 line-through">${product.originalPrice}</span>
                    )}
                  </div>
                  
                  <Button
                    onClick={() => addToCart(product.id)}
                    disabled={!product.inStock}
                    className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {product.inStock ? 'Add to Cart' : 'Out of Stock'}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black/50 border-t border-white/10 py-12">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h3 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent mb-4">
              HookahRoyale
            </h3>
            <p className="text-gray-400 mb-4">Premium hookah experience delivered to your doorstep</p>
            <p className="text-gray-500 text-sm">© 2024 HookahRoyale. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import {
  getHookahs,
  getTobaccoTypes,
  getFlavors,
  getRecommendedMixes,
  createHookah,
  createTobaccoType,
  createFlavor,
  createRecommendedMix,
  updateHookah,
  updateTobaccoType,
  updateFlavor,
  updateRecommendedMix,
  deleteHookah,
  deleteTobaccoType,
  deleteFlavor,
  deleteRecommendedMix
} from '@/services/menuService';
import { DatabaseHookah, DatabaseTobaccoType, DatabaseFlavor, DatabaseRecommendedMix } from '@/types/database';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MenuManagement = () => {
  const [hookahs, setHookahs] = useState<DatabaseHookah[]>([]);
  const [tobaccoTypes, setTobaccoTypes] = useState<DatabaseTobaccoType[]>([]);
  const [flavors, setFlavors] = useState<DatabaseFlavor[]>([]);
  const [recommendedMixes, setRecommendedMixes] = useState<DatabaseRecommendedMix[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('hookahs');
  
  const [isHookahModalOpen, setIsHookahModalOpen] = useState(false);
  const [isTobaccoModalOpen, setIsTobaccoModalOpen] = useState(false);
  const [isFlavorModalOpen, setIsFlavorModalOpen] = useState(false);
  const [isMixModalOpen, setIsMixModalOpen] = useState(false);

  const [hookahForm, setHookahForm] = useState({
    name: '',
    price: 0,
    image: '',
    isActive: true
  });

  const [tobaccoForm, setTobaccoForm] = useState({
    name: '',
    description: '',
    type: 'blond' as 'blond' | 'dark',
    image: '',
    strengthRange: { min: 1, max: 5 },
    isActive: true
  });

  const [flavorForm, setFlavorForm] = useState({
    name: '',
    image: '',
    compatibleTobaccoTypes: ['blond'] as ('blond' | 'dark')[],
    isActive: true
  });

  const [mixForm, setMixForm] = useState({
    name: '',
    price: 0,
    category: '',
    mainImage: '',
    flavorImages: [''],
    bgColor: 'bg-teal-500',
    promoText: '',
    isActive: true
  });

  const [editingHookah, setEditingHookah] = useState<DatabaseHookah | null>(null);
  const [editingTobacco, setEditingTobacco] = useState<DatabaseTobaccoType | null>(null);
  const [editingFlavor, setEditingFlavor] = useState<DatabaseFlavor | null>(null);
  const [editingMix, setEditingMix] = useState<DatabaseRecommendedMix | null>(null);

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
        title: "Error",
        description: "Failed to load menu data.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditHookah = (hookah: DatabaseHookah) => {
    setEditingHookah(hookah);
    setHookahForm({
      name: hookah.name,
      price: hookah.price,
      image: hookah.image,
      isActive: hookah.isActive
    });
    setIsHookahModalOpen(true);
  };

  const handleEditTobacco = (tobacco: DatabaseTobaccoType) => {
    setEditingTobacco(tobacco);
    setTobaccoForm({
      name: tobacco.name,
      description: tobacco.description,
      type: tobacco.type,
      image: tobacco.image,
      strengthRange: tobacco.strengthRange,
      isActive: tobacco.isActive
    });
    setIsTobaccoModalOpen(true);
  };

  const handleEditFlavor = (flavor: DatabaseFlavor) => {
    setEditingFlavor(flavor);
    setFlavorForm({
      name: flavor.name,
      image: flavor.image,
      compatibleTobaccoTypes: flavor.compatibleTobaccoTypes,
      isActive: flavor.isActive
    });
    setIsFlavorModalOpen(true);
  };

  const handleEditMix = (mix: DatabaseRecommendedMix) => {
    setEditingMix(mix);
    setMixForm({
      name: mix.name,
      price: mix.price,
      category: mix.category,
      mainImage: mix.mainImage,
      flavorImages: mix.flavorImages,
      bgColor: mix.bgColor,
      promoText: mix.promoText || '',
      isActive: mix.isActive
    });
    setIsMixModalOpen(true);
  };

  const handleCreateHookah = async () => {
    try {
      if (editingHookah) {
        await updateHookah(editingHookah.id, hookahForm);
        toast({
          title: "Success",
          description: "Hookah updated successfully!"
        });
      } else {
        await createHookah(hookahForm);
        toast({
          title: "Success",
          description: "Hookah created successfully!"
        });
      }
      setIsHookahModalOpen(false);
      setEditingHookah(null);
      setHookahForm({ name: '', price: 0, image: '', isActive: true });
      loadMenuData();
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${editingHookah ? 'update' : 'create'} hookah.`,
        variant: "destructive"
      });
    }
  };

  const handleCreateTobacco = async () => {
    try {
      if (editingTobacco) {
        await updateTobaccoType(editingTobacco.id, tobaccoForm);
        toast({
          title: "Success",
          description: "Tobacco type updated successfully!"
        });
      } else {
        await createTobaccoType(tobaccoForm);
        toast({
          title: "Success",
          description: "Tobacco type created successfully!"
        });
      }
      setIsTobaccoModalOpen(false);
      setEditingTobacco(null);
      setTobaccoForm({
        name: '',
        description: '',
        type: 'blond',
        image: '',
        strengthRange: { min: 1, max: 5 },
        isActive: true
      });
      loadMenuData();
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${editingTobacco ? 'update' : 'create'} tobacco type.`,
        variant: "destructive"
      });
    }
  };

  const handleCreateFlavor = async () => {
    try {
      if (editingFlavor) {
        await updateFlavor(editingFlavor.id, flavorForm);
        toast({
          title: "Success",
          description: "Flavor updated successfully!"
        });
      } else {
        await createFlavor(flavorForm);
        toast({
          title: "Success",
          description: "Flavor created successfully!"
        });
      }
      setIsFlavorModalOpen(false);
      setEditingFlavor(null);
      setFlavorForm({
        name: '',
        image: '',
        compatibleTobaccoTypes: ['blond'],
        isActive: true
      });
      loadMenuData();
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${editingFlavor ? 'update' : 'create'} flavor.`,
        variant: "destructive"
      });
    }
  };

  const handleCreateMix = async () => {
    try {
      if (editingMix) {
        await updateRecommendedMix(editingMix.id, mixForm);
        toast({
          title: "Success",
          description: "Recommended mix updated successfully!"
        });
      } else {
        await createRecommendedMix(mixForm);
        toast({
          title: "Success",
          description: "Recommended mix created successfully!"
        });
      }
      setIsMixModalOpen(false);
      setEditingMix(null);
      setMixForm({
        name: '',
        price: 0,
        category: '',
        mainImage: '',
        flavorImages: [''],
        bgColor: 'bg-teal-500',
        promoText: '',
        isActive: true
      });
      loadMenuData();
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${editingMix ? 'update' : 'create'} recommended mix.`,
        variant: "destructive"
      });
    }
  };

  const handleDeleteHookah = async (id: string) => {
    if (confirm('Are you sure you want to delete this hookah?')) {
      try {
        await deleteHookah(id);
        toast({
          title: "Success",
          description: "Hookah deleted successfully!"
        });
        loadMenuData();
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete hookah.",
          variant: "destructive"
        });
      }
    }
  };

  const handleDeleteTobacco = async (id: string) => {
    if (confirm('Are you sure you want to delete this tobacco type?')) {
      try {
        await deleteTobaccoType(id);
        toast({
          title: "Success",
          description: "Tobacco type deleted successfully!"
        });
        loadMenuData();
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete tobacco type.",
          variant: "destructive"
        });
      }
    }
  };

  const handleDeleteFlavor = async (id: string) => {
    if (confirm('Are you sure you want to delete this flavor?')) {
      try {
        await deleteFlavor(id);
        toast({
          title: "Success",
          description: "Flavor deleted successfully!"
        });
        loadMenuData();
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete flavor.",
          variant: "destructive"
        });
      }
    }
  };

  const handleDeleteMix = async (id: string) => {
    if (confirm('Are you sure you want to delete this recommended mix?')) {
      try {
        await deleteRecommendedMix(id);
        toast({
          title: "Success",
          description: "Recommended mix deleted successfully!"
        });
        loadMenuData();
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete recommended mix.",
          variant: "destructive"
        });
      }
    }
  };

  const resetModals = () => {
    setEditingHookah(null);
    setEditingTobacco(null);
    setEditingFlavor(null);
    setEditingMix(null);
  };

  useEffect(() => {
    loadMenuData();
  }, []);

  return (
    <div className="min-h-screen bg-turbo-dark text-turbo-text">
      <header className="flex items-center justify-between p-4 border-b border-border">
        <NavigationSidebar />
        <h1 className="text-2xl font-bold tracking-wider">MENU MANAGEMENT</h1>
        <div className="w-10" />
      </header>

      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-turbo-card mb-6">
            <TabsTrigger value="hookahs">Hookahs</TabsTrigger>
            <TabsTrigger value="tobacco">Tobacco Types</TabsTrigger>
            <TabsTrigger value="flavors">Flavors</TabsTrigger>
            <TabsTrigger value="mixes">Recommended Mixes</TabsTrigger>
          </TabsList>

          <TabsContent value="hookahs">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Manage Hookahs</h2>
              <Button onClick={() => setIsHookahModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Hookah
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {hookahs.map((hookah) => (
                <Card key={hookah.id} className="bg-turbo-card border-border">
                  <CardContent className="p-4">
                    <img src={hookah.image} alt={hookah.name} className="w-full h-32 object-cover rounded mb-2" />
                    <h3 className="font-semibold">{hookah.name}</h3>
                    <p className="text-amber-400 font-bold">{hookah.price} Lei</p>
                    <p className="text-xs text-turbo-muted">Active: {hookah.isActive ? 'Yes' : 'No'}</p>
                    <div className="flex gap-2 mt-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleEditHookah(hookah)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => handleDeleteHookah(hookah.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="tobacco">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Manage Tobacco Types</h2>
              <Button onClick={() => setIsTobaccoModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Tobacco Type
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tobaccoTypes.map((tobacco) => (
                <Card key={tobacco.id} className="bg-turbo-card border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <img src={tobacco.image} alt={tobacco.name} className="w-16 h-16 object-cover rounded" />
                      <div className="flex-1">
                        <h3 className="font-semibold">{tobacco.name}</h3>
                        <p className="text-sm text-turbo-muted">{tobacco.description}</p>
                        <p className="text-xs">Type: {tobacco.type}</p>
                        <p className="text-xs">Strength: {tobacco.strengthRange.min}-{tobacco.strengthRange.max}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleEditTobacco(tobacco)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => handleDeleteTobacco(tobacco.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="flavors">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Manage Flavors</h2>
              <Button onClick={() => setIsFlavorModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Flavor
              </Button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {flavors.map((flavor) => (
                <Card key={flavor.id} className="bg-turbo-card border-border">
                  <CardContent className="p-4 text-center">
                    <img src={flavor.image} alt={flavor.name} className="w-full h-16 object-cover rounded mb-2" />
                    <h3 className="text-xs font-medium">{flavor.name}</h3>
                    <p className="text-xs text-turbo-muted">
                      {flavor.compatibleTobaccoTypes.join(', ')}
                    </p>
                    <div className="flex gap-1 mt-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => handleEditFlavor(flavor)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        className="flex-1 text-xs"
                        onClick={() => handleDeleteFlavor(flavor.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="mixes">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Manage Recommended Mixes</h2>
              <Button onClick={() => setIsMixModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Mix
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommendedMixes.map((mix) => (
                <Card key={mix.id} className="bg-turbo-card border-border">
                  <CardContent className="p-4">
                    <img src={mix.mainImage} alt={mix.name} className="w-full h-32 object-cover rounded mb-2" />
                    <h3 className="font-semibold">{mix.name}</h3>
                    <p className="text-amber-400 font-bold">{mix.price} Lei</p>
                    <p className="text-sm text-turbo-muted">{mix.category}</p>
                    {mix.promoText && (
                      <p className="text-xs text-turbo-muted mt-1">{mix.promoText}</p>
                    )}
                    <div className="flex gap-2 mt-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleEditMix(mix)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => handleDeleteMix(mix.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isHookahModalOpen} onOpenChange={(open) => {
        setIsHookahModalOpen(open);
        if (!open) resetModals();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingHookah ? 'Edit Hookah' : 'Add New Hookah'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="hookah-name">Name</Label>
              <Input
                id="hookah-name"
                value={hookahForm.name}
                onChange={(e) => setHookahForm({...hookahForm, name: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="hookah-price">Price (Lei)</Label>
              <Input
                id="hookah-price"
                type="number"
                value={hookahForm.price}
                onChange={(e) => setHookahForm({...hookahForm, price: Number(e.target.value)})}
              />
            </div>
            <div>
              <Label htmlFor="hookah-image">Image URL</Label>
              <Input
                id="hookah-image"
                value={hookahForm.image}
                onChange={(e) => setHookahForm({...hookahForm, image: e.target.value})}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={hookahForm.isActive}
                onCheckedChange={(checked) => setHookahForm({...hookahForm, isActive: checked})}
              />
              <Label>Active</Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateHookah} className="flex-1">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button variant="outline" onClick={() => setIsHookahModalOpen(false)} className="flex-1">
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tobacco Type Modal */}
      <Dialog open={isTobaccoModalOpen} onOpenChange={(open) => {
        setIsTobaccoModalOpen(open);
        if (!open) resetModals();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTobacco ? 'Edit Tobacco Type' : 'Add New Tobacco Type'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="tobacco-name">Name</Label>
              <Input
                id="tobacco-name"
                value={tobaccoForm.name}
                onChange={(e) => setTobaccoForm({...tobaccoForm, name: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="tobacco-description">Description</Label>
              <Textarea
                id="tobacco-description"
                value={tobaccoForm.description}
                onChange={(e) => setTobaccoForm({...tobaccoForm, description: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="tobacco-type">Type</Label>
              <Select 
                value={tobaccoForm.type} 
                onValueChange={(value: 'blond' | 'dark') => setTobaccoForm({...tobaccoForm, type: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blond">Blond</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tobacco-image">Image URL</Label>
              <Input
                id="tobacco-image"
                value={tobaccoForm.image}
                onChange={(e) => setTobaccoForm({...tobaccoForm, image: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tobacco-min-strength">Min Strength</Label>
                <Input
                  id="tobacco-min-strength"
                  type="number"
                  min="1"
                  max="10"
                  value={tobaccoForm.strengthRange.min}
                  onChange={(e) => setTobaccoForm({
                    ...tobaccoForm, 
                    strengthRange: {...tobaccoForm.strengthRange, min: Number(e.target.value)}
                  })}
                />
              </div>
              <div>
                <Label htmlFor="tobacco-max-strength">Max Strength</Label>
                <Input
                  id="tobacco-max-strength"
                  type="number"
                  min="1"
                  max="10"
                  value={tobaccoForm.strengthRange.max}
                  onChange={(e) => setTobaccoForm({
                    ...tobaccoForm, 
                    strengthRange: {...tobaccoForm.strengthRange, max: Number(e.target.value)}
                  })}
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={tobaccoForm.isActive}
                onCheckedChange={(checked) => setTobaccoForm({...tobaccoForm, isActive: checked})}
              />
              <Label>Active</Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateTobacco} className="flex-1">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button variant="outline" onClick={() => setIsTobaccoModalOpen(false)} className="flex-1">
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Flavor Modal */}
      <Dialog open={isFlavorModalOpen} onOpenChange={(open) => {
        setIsFlavorModalOpen(open);
        if (!open) resetModals();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFlavor ? 'Edit Flavor' : 'Add New Flavor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="flavor-name">Name</Label>
              <Input
                id="flavor-name"
                value={flavorForm.name}
                onChange={(e) => setFlavorForm({...flavorForm, name: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="flavor-image">Image URL</Label>
              <Input
                id="flavor-image"
                value={flavorForm.image}
                onChange={(e) => setFlavorForm({...flavorForm, image: e.target.value})}
              />
            </div>
            <div>
              <Label>Compatible Tobacco Types</Label>
              <div className="flex items-center space-x-4 mt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="blond-compatible"
                    checked={flavorForm.compatibleTobaccoTypes.includes('blond')}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setFlavorForm({
                          ...flavorForm,
                          compatibleTobaccoTypes: [...flavorForm.compatibleTobaccoTypes, 'blond']
                        });
                      } else {
                        setFlavorForm({
                          ...flavorForm,
                          compatibleTobaccoTypes: flavorForm.compatibleTobaccoTypes.filter(t => t !== 'blond')
                        });
                      }
                    }}
                  />
                  <Label htmlFor="blond-compatible">Blond</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="dark-compatible"
                    checked={flavorForm.compatibleTobaccoTypes.includes('dark')}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setFlavorForm({
                          ...flavorForm,
                          compatibleTobaccoTypes: [...flavorForm.compatibleTobaccoTypes, 'dark']
                        });
                      } else {
                        setFlavorForm({
                          ...flavorForm,
                          compatibleTobaccoTypes: flavorForm.compatibleTobaccoTypes.filter(t => t !== 'dark')
                        });
                      }
                    }}
                  />
                  <Label htmlFor="dark-compatible">Dark</Label>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={flavorForm.isActive}
                onCheckedChange={(checked) => setFlavorForm({...flavorForm, isActive: checked})}
              />
              <Label>Active</Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateFlavor} className="flex-1">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button variant="outline" onClick={() => setIsFlavorModalOpen(false)} className="flex-1">
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recommended Mix Modal */}
      <Dialog open={isMixModalOpen} onOpenChange={(open) => {
        setIsMixModalOpen(open);
        if (!open) resetModals();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingMix ? 'Edit Recommended Mix' : 'Add New Recommended Mix'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="mix-name">Name</Label>
                <Input
                  id="mix-name"
                  value={mixForm.name}
                  onChange={(e) => setMixForm({...mixForm, name: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="mix-price">Price (Lei)</Label>
                <Input
                  id="mix-price"
                  type="number"
                  value={mixForm.price}
                  onChange={(e) => setMixForm({...mixForm, price: Number(e.target.value)})}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="mix-category">Category</Label>
              <Input
                id="mix-category"
                value={mixForm.category}
                onChange={(e) => setMixForm({...mixForm, category: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="mix-main-image">Main Image URL</Label>
              <Input
                id="mix-main-image"
                value={mixForm.mainImage}
                onChange={(e) => setMixForm({...mixForm, mainImage: e.target.value})}
              />
            </div>
            <div>
              <Label>Flavor Images (URLs)</Label>
              {mixForm.flavorImages.map((image, index) => (
                <div key={index} className="flex gap-2 mt-2">
                  <Input
                    value={image}
                    placeholder={`Flavor image ${index + 1} URL`}
                    onChange={(e) => {
                      const newImages = [...mixForm.flavorImages];
                      newImages[index] = e.target.value;
                      setMixForm({...mixForm, flavorImages: newImages});
                    }}
                  />
                  {mixForm.flavorImages.length > 1 && (
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => {
                        const newImages = mixForm.flavorImages.filter((_, i) => i !== index);
                        setMixForm({...mixForm, flavorImages: newImages});
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2"
                onClick={() => setMixForm({...mixForm, flavorImages: [...mixForm.flavorImages, '']})}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Flavor Image
              </Button>
            </div>
            <div>
              <Label htmlFor="mix-bg-color">Background Color</Label>
              <Select 
                value={mixForm.bgColor} 
                onValueChange={(value) => setMixForm({...mixForm, bgColor: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bg-teal-500">Teal</SelectItem>
                  <SelectItem value="bg-blue-500">Blue</SelectItem>
                  <SelectItem value="bg-purple-500">Purple</SelectItem>
                  <SelectItem value="bg-green-500">Green</SelectItem>
                  <SelectItem value="bg-orange-500">Orange</SelectItem>
                  <SelectItem value="bg-red-500">Red</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="mix-promo-text">Promotional Text (Optional)</Label>
              <Textarea
                id="mix-promo-text"
                value={mixForm.promoText}
                onChange={(e) => setMixForm({...mixForm, promoText: e.target.value})}
                placeholder="Special offer or promotional message..."
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={mixForm.isActive}
                onCheckedChange={(checked) => setMixForm({...mixForm, isActive: checked})}
              />
              <Label>Active</Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateMix} className="flex-1">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button variant="outline" onClick={() => setIsMixModalOpen(false)} className="flex-1">
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MenuManagement;

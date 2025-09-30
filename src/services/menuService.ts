import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { DatabaseHookah, DatabaseTobaccoType, DatabaseFlavor, DatabaseRecommendedMix } from '@/types/database';
import { safeConvertTimestamp, cleanObject } from './firebaseService';

const MENU_COLLECTIONS = {
  HOOKAHS: 'hookahs',
  TOBACCO_TYPES: 'tobaccoTypes',
  FLAVORS: 'flavors',
  RECOMMENDED_MIXES: 'recommendedMixes'
} as const;

// Hookah operations
export const createHookah = async (hookahData: Omit<DatabaseHookah, 'id' | 'createdAt' | 'updatedAt'>) => {
  try {
    const cleanedData = cleanObject({
      ...hookahData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    const docRef = await addDoc(collection(firestore, MENU_COLLECTIONS.HOOKAHS), cleanedData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating hookah:', error);
    throw error;
  }
};

export const getHookahs = async (): Promise<DatabaseHookah[]> => {
  try {
    const hookahsQuery = query(
      collection(firestore, MENU_COLLECTIONS.HOOKAHS),
      where('isActive', '==', true),
      orderBy('price', 'desc')
    );
    
    const querySnapshot = await getDocs(hookahsQuery);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: safeConvertTimestamp(doc.data().createdAt),
      updatedAt: safeConvertTimestamp(doc.data().updatedAt)
    })) as DatabaseHookah[];
  } catch (error) {
    console.error('Error getting hookahs:', error);
    throw error;
  }
};

// Tobacco type operations
export const createTobaccoType = async (tobaccoData: Omit<DatabaseTobaccoType, 'id' | 'createdAt' | 'updatedAt'>) => {
  try {
    const cleanedData = cleanObject({
      ...tobaccoData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    const docRef = await addDoc(collection(firestore, MENU_COLLECTIONS.TOBACCO_TYPES), cleanedData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating tobacco type:', error);
    throw error;
  }
};

export const getTobaccoTypes = async (): Promise<DatabaseTobaccoType[]> => {
  try {
    const tobaccoQuery = query(
      collection(firestore, MENU_COLLECTIONS.TOBACCO_TYPES),
      where('isActive', '==', true)
    );
    
    const querySnapshot = await getDocs(tobaccoQuery);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: safeConvertTimestamp(doc.data().createdAt),
      updatedAt: safeConvertTimestamp(doc.data().updatedAt)
    })) as DatabaseTobaccoType[];
  } catch (error) {
    console.error('Error getting tobacco types:', error);
    throw error;
  }
};

// Flavor operations
export const createFlavor = async (flavorData: Omit<DatabaseFlavor, 'id' | 'createdAt' | 'updatedAt'>) => {
  try {
    const cleanedData = cleanObject({
      ...flavorData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    const docRef = await addDoc(collection(firestore, MENU_COLLECTIONS.FLAVORS), cleanedData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating flavor:', error);
    throw error;
  }
};

export const getFlavors = async (tobaccoType?: 'blond' | 'dark'): Promise<DatabaseFlavor[]> => {
  try {
    let flavorsQuery = query(
      collection(firestore, MENU_COLLECTIONS.FLAVORS),
      where('isActive', '==', true)
    );
    
    const querySnapshot = await getDocs(flavorsQuery);
    let flavors = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: safeConvertTimestamp(doc.data().createdAt),
      updatedAt: safeConvertTimestamp(doc.data().updatedAt)
    })) as DatabaseFlavor[];
    
    // Filter by tobacco type if specified
    if (tobaccoType) {
      flavors = flavors.filter(flavor => 
        flavor.compatibleTobaccoTypes.includes(tobaccoType)
      );
    }
    
    return flavors;
  } catch (error) {
    console.error('Error getting flavors:', error);
    throw error;
  }
};

// Recommended mix operations
export const createRecommendedMix = async (mixData: Omit<DatabaseRecommendedMix, 'id' | 'createdAt' | 'updatedAt'>) => {
  try {
    const cleanedData = cleanObject({
      ...mixData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    const docRef = await addDoc(collection(firestore, MENU_COLLECTIONS.RECOMMENDED_MIXES), cleanedData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating recommended mix:', error);
    throw error;
  }
};

export const getRecommendedMixes = async (): Promise<DatabaseRecommendedMix[]> => {
  try {
    const mixesQuery = query(
      collection(firestore, MENU_COLLECTIONS.RECOMMENDED_MIXES),
      where('isActive', '==', true),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(mixesQuery);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: safeConvertTimestamp(doc.data().createdAt),
      updatedAt: safeConvertTimestamp(doc.data().updatedAt)
    })) as DatabaseRecommendedMix[];
  } catch (error) {
    console.error('Error getting recommended mixes:', error);
    throw error;
  }
};

// Update operations
export const updateHookah = async (id: string, updates: Partial<DatabaseHookah>) => {
  try {
    const hookahRef = doc(firestore, MENU_COLLECTIONS.HOOKAHS, id);
    await updateDoc(hookahRef, {
      ...cleanObject(updates),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating hookah:', error);
    throw error;
  }
};

export const updateTobaccoType = async (id: string, updates: Partial<DatabaseTobaccoType>) => {
  try {
    const tobaccoRef = doc(firestore, MENU_COLLECTIONS.TOBACCO_TYPES, id);
    await updateDoc(tobaccoRef, {
      ...cleanObject(updates),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating tobacco type:', error);
    throw error;
  }
};

export const updateFlavor = async (id: string, updates: Partial<DatabaseFlavor>) => {
  try {
    const flavorRef = doc(firestore, MENU_COLLECTIONS.FLAVORS, id);
    await updateDoc(flavorRef, {
      ...cleanObject(updates),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating flavor:', error);
    throw error;
  }
};

export const updateRecommendedMix = async (id: string, updates: Partial<DatabaseRecommendedMix>) => {
  try {
    const mixRef = doc(firestore, MENU_COLLECTIONS.RECOMMENDED_MIXES, id);
    await updateDoc(mixRef, {
      ...cleanObject(updates),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating recommended mix:', error);
    throw error;
  }
};

// Delete operations (soft delete by setting isActive to false)
export const deleteHookah = async (id: string) => {
  try {
    await updateHookah(id, { isActive: false });
  } catch (error) {
    console.error('Error deleting hookah:', error);
    throw error;
  }
};

export const deleteTobaccoType = async (id: string) => {
  try {
    await updateTobaccoType(id, { isActive: false });
  } catch (error) {
    console.error('Error deleting tobacco type:', error);
    throw error;
  }
};

export const deleteFlavor = async (id: string) => {
  try {
    await updateFlavor(id, { isActive: false });
  } catch (error) {
    console.error('Error deleting flavor:', error);
    throw error;
  }
};

export const deleteRecommendedMix = async (id: string) => {
  try {
    await updateRecommendedMix(id, { isActive: false });
  } catch (error) {
    console.error('Error deleting recommended mix:', error);
    throw error;
  }
};

// Real-time subscriptions
export const subscribeToMenuData = (
  onHookahsChange: (hookahs: DatabaseHookah[]) => void,
  onTobaccoTypesChange: (types: DatabaseTobaccoType[]) => void,
  onFlavorsChange: (flavors: DatabaseFlavor[]) => void,
  onMixesChange: (mixes: DatabaseRecommendedMix[]) => void
) => {
  const unsubscribeHookahs = onSnapshot(
    query(collection(firestore, MENU_COLLECTIONS.HOOKAHS), where('isActive', '==', true)),
    (snapshot) => {
      const hookahs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: safeConvertTimestamp(doc.data().createdAt),
        updatedAt: safeConvertTimestamp(doc.data().updatedAt)
      })) as DatabaseHookah[];
      onHookahsChange(hookahs);
    }
  );

  const unsubscribeTobacco = onSnapshot(
    query(collection(firestore, MENU_COLLECTIONS.TOBACCO_TYPES), where('isActive', '==', true)),
    (snapshot) => {
      const types = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: safeConvertTimestamp(doc.data().createdAt),
        updatedAt: safeConvertTimestamp(doc.data().updatedAt)
      })) as DatabaseTobaccoType[];
      onTobaccoTypesChange(types);
    }
  );

  const unsubscribeFlavors = onSnapshot(
    query(collection(firestore, MENU_COLLECTIONS.FLAVORS), where('isActive', '==', true)),
    (snapshot) => {
      const flavors = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: safeConvertTimestamp(doc.data().createdAt),
        updatedAt: safeConvertTimestamp(doc.data().updatedAt)
      })) as DatabaseFlavor[];
      onFlavorsChange(flavors);
    }
  );

  const unsubscribeMixes = onSnapshot(
    query(collection(firestore, MENU_COLLECTIONS.RECOMMENDED_MIXES), where('isActive', '==', true)),
    (snapshot) => {
      const mixes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: safeConvertTimestamp(doc.data().createdAt),
        updatedAt: safeConvertTimestamp(doc.data().updatedAt)
      })) as DatabaseRecommendedMix[];
      onMixesChange(mixes);
    }
  );

  return () => {
    unsubscribeHookahs();
    unsubscribeTobacco();
    unsubscribeFlavors();
    unsubscribeMixes();
  };
};

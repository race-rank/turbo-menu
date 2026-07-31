import {
  collection,
  doc,
  addDoc,
  setDoc,
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

// Denormalized copy of the four menu collections. Guests read this single
// document instead of running four queries on a cold Firestore connection.
const MENU_SNAPSHOT_COLLECTION = 'menu';
const MENU_SNAPSHOT_ID = 'current';

export interface MenuData {
  hookahs: DatabaseHookah[];
  tobaccoTypes: DatabaseTobaccoType[];
  flavors: DatabaseFlavor[];
  recommendedMixes: DatabaseRecommendedMix[];
}

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

export const getFlavors = async (tobaccoType?: 'virginia' | 'darkblend' | 'cigarleaf'): Promise<DatabaseFlavor[]> => {
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

// Menu snapshot (single-document read path for guests)

const fetchMenuCollections = async (): Promise<MenuData> => {
  const [hookahs, tobaccoTypes, flavors, recommendedMixes] = await Promise.all([
    getHookahs(),
    getTobaccoTypes(),
    getFlavors(),
    getRecommendedMixes()
  ]);
  return { hookahs, tobaccoTypes, flavors, recommendedMixes };
};

const reviveMenuItems = <T,>(items: unknown): T[] =>
  (Array.isArray(items) ? items : []).map((item: any) => ({
    ...item,
    createdAt: safeConvertTimestamp(item?.createdAt),
    updatedAt: safeConvertTimestamp(item?.updatedAt)
  })) as T[];

// Firestore rejects undefined. cleanObject() can't be reused here because it
// flattens Date instances to {} - menu items carry real Dates.
const stripUndefined = (value: any): any => {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested !== undefined) out[key] = stripUndefined(nested);
    }
    return out;
  }
  return value;
};

/**
 * Read the whole menu. Costs one document read when the snapshot exists, and
 * falls back to the four collection queries when it doesn't (never published,
 * or security rules deny it), so the menu always renders.
 */
export const getMenuData = async (): Promise<MenuData> => {
  try {
    const snapshot = await getDoc(doc(firestore, MENU_SNAPSHOT_COLLECTION, MENU_SNAPSHOT_ID));
    if (snapshot.exists()) {
      const data = snapshot.data();
      return {
        hookahs: reviveMenuItems<DatabaseHookah>(data.hookahs),
        tobaccoTypes: reviveMenuItems<DatabaseTobaccoType>(data.tobaccoTypes),
        flavors: reviveMenuItems<DatabaseFlavor>(data.flavors),
        recommendedMixes: reviveMenuItems<DatabaseRecommendedMix>(data.recommendedMixes)
      };
    }
  } catch (error) {
    console.warn('Menu snapshot unavailable, falling back to collection queries:', error);
  }

  return fetchMenuCollections();
};

/**
 * Rebuild the snapshot guests read. Must run after every menu mutation,
 * otherwise guests keep seeing the previously published menu.
 */
export const publishMenuSnapshot = async (): Promise<void> => {
  const menu = await fetchMenuCollections();

  // serverTimestamp() is added outside stripUndefined so the sentinel survives.
  await setDoc(doc(firestore, MENU_SNAPSHOT_COLLECTION, MENU_SNAPSHOT_ID), {
    ...stripUndefined(menu),
    publishedAt: serverTimestamp()
  });
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

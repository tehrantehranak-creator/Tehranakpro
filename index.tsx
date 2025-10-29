import React, { useState, useEffect, createContext, useContext, useRef, useCallback, FC, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
// FIX: Cast motion to any to bypass type errors with framer-motion props.
// This is a workaround for what appears to be a type definition issue with the
// project's specific dependency versions (e.g., React, TypeScript, Framer Motion).
import { motion as motionSrc, AnimatePresence, useAnimation } from 'framer-motion';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { GoogleGenAI, Modality, LiveServerMessage, Blob, FunctionDeclaration, Type } from '@google/genai';
import { Home, Building, Users, Settings, Plus, X, BedDouble, Building2, UserPlus, Check, Star, UploadCloud, Send, Copy, Phone, Edit, Trash2, Download, Maximize, ChevronLeft, ChevronRight, Target, Sparkles, Volume2, Mic, Bot, Bell, Calendar, Percent, FilePlus, Calculator, ChevronLeft as ChevronLeftIcon, Circle, Search, MicOff } from 'lucide-react';

const motion = motionSrc as any;
const ai = new GoogleGenAI({ apiKey: "AIzaSyBntznkUB8B5IGv5JLKAUb_heB7fS3rG4U" }); // !مهم: کلید API واقعی خود را به جای این متن قرار دهید

// Interfaces (Type Definitions)
// =================================

interface Listing {
    id: string;
    type: 'residential' | 'commercial';
    transactionType: 'sale' | 'rent' | 'presale' | 'partnership';
    address: string;
    area: number;
    images: string[];
    ownerName: string;
    ownerPhone: string;

    // Residential fields
    bedrooms?: number;
    floor?: number;
    buildYear?: number;
    hasElevator?: boolean;
    hasParking?: boolean;
    hasWarehouse?: boolean;
    totalPrice?: number;
    deposit?: number;
    monthlyRent?: number;
    deedStatus?: string;

    // Commercial fields
    commercialType?: string;
    frontWidth?: number;
    length?: number;
    ceilingHeight?: number;
    hasOpenCeiling?: boolean;
    locationType?: string;
    commercialDeedStatus?: string;
    currentStatus?: string;
    
    description: string;
    createdAt: string;
}

interface Client {
    id: string;
    name: string;
    phone: string;
    requestType: 'buy' | 'rent' | 'mortgage';
    propertyType: 'residential' | 'commercial' | 'office';
    budgetFrom: number;
    budgetTo: number;
    areaFrom: number;
    areaTo: number;
    location: string;
    requiredFeatures: string;
    description: string;
    createdAt: string;
}

interface Reminder {
    id: string;
    clientId: string;
    clientName: string;
    reminderDate: string; // ISO string
    notes: string;
    createdAt: string;
}

interface Commission {
    id: string;
    buyerName: string;
    sellerName: string;
    contractDate: string; // ISO string
    totalCommission: number;
    consultantShare: number;
    createdAt: string;
}


interface AppNotification {
    id: number;
    message: string;
    read: boolean;
    timestamp: number;
}

interface AppSettings {
    goalsEnabled: boolean;
    gratitudeEnabled: boolean;
}

// FIX: Update the TehranakDB schema. The `settings`, `goals`, and `dailyMessages` object stores are created with a `keyPath`.
// This means the objects stored within them must contain the key property. The `value` type for these stores is updated
// to reflect this, resolving errors where objects with a `key` property were being put into stores expecting a value without it.
interface TehranakDB extends DBSchema {
    listings: {
        key: string;
        value: Listing;
        indexes: { 'by-type': string };
    };
    clients: {
        key: string;
        value: Client;
        indexes: { 'by-name': string };
    };
    settings: {
        key: string;
        value: AppSettings & { key: string };
    };
    goals: {
        key: string;
        value: { text: string; key: string };
    };
    reminders: {
        key: string;
        value: Reminder;
        indexes: { 'by-date': string };
    };
    // FIX: The value for the `notifications` store is updated to `AppNotification`.
    // The original type was missing the `id` property, which is defined as the `keyPath`.
    // This ensures data fetched from the store is correctly typed, resolving an error
    // when updating the component's state.
    notifications: {
        key: number;
        value: AppNotification;
        indexes: { 'by-timestamp': string };
    };
    commissions: {
        key: string;
        value: Commission;
        indexes: { 'by-contract-date': string };
    };
}

// Database Helper
// =================================

let dbPromise: Promise<IDBPDatabase<TehranakDB>> | null = null;
const DB_NAME = 'tehranak-db';
const DB_VERSION = 6; // Incremented version for new stores

const initDB = () => {
    if (dbPromise) return dbPromise;
    dbPromise = openDB<TehranakDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            if (oldVersion < 1) {
                if (!db.objectStoreNames.contains('listings')) {
                    const listingStore = db.createObjectStore('listings', { keyPath: 'id' });
                    listingStore.createIndex('by-type', 'type');
                }
                if (!db.objectStoreNames.contains('clients')) {
                    const clientStore = db.createObjectStore('clients', { keyPath: 'id' });
                    clientStore.createIndex('by-name', 'name');
                }
            }
             if (oldVersion < 2) {
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('goals')) {
                    db.createObjectStore('goals', { keyPath: 'key' });
                }
            }
             if (oldVersion < 3) {
                 // FIX: Cast 'dailyMessages' to `any` to allow deleting an old object store
                 // that is not part of the current DB schema. This is a one-time migration step.
                 if (db.objectStoreNames.contains('dailyMessages' as any)) {
                     db.deleteObjectStore('dailyMessages' as any);
                 }
             }
             if (oldVersion < 4) {
                 if (!db.objectStoreNames.contains('reminders')) {
                    const reminderStore = db.createObjectStore('reminders', { keyPath: 'id' });
                    reminderStore.createIndex('by-date', 'reminderDate');
                 }
             }
             if (oldVersion < 5) {
                if (!db.objectStoreNames.contains('notifications')) {
                    const notificationStore = db.createObjectStore('notifications', { keyPath: 'id', autoIncrement: true });
                    notificationStore.createIndex('by-timestamp', 'timestamp');
                }
            }
             if (oldVersion < 6) {
                if (!db.objectStoreNames.contains('commissions')) {
                    const commissionStore = db.createObjectStore('commissions', { keyPath: 'id' });
                    commissionStore.createIndex('by-contract-date', 'contractDate');
                }
            }
        },
    });
    return dbPromise;
};

// App Context for State Management
// =================================

type Page = 'dashboard' | 'listings' | 'clients' | 'commission' | 'settings' | 'reminders';
type Modal = null | 'add-residential' | 'add-commercial' | 'add-client' | 'search' | 'edit-residential' | 'edit-commercial' | 'set-goals' | 'add-reminder' | 'add-commission';
type PermissionState = 'prompt' | 'granted' | 'denied';

interface AppContextType {
    user: { role: 'admin' | 'user' } | null;
    login: (role: 'admin' | 'user') => void;
    logout: () => void;
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
    activeModal: Modal;
    setActiveModal: (modal: Modal) => void;
    listings: Listing[];
    clients: Client[];
    reminders: Reminder[];
    commissions: Commission[];
    addListing: (listing: Listing) => Promise<void>;
    updateListing: (listing: Listing) => Promise<void>;
    deleteListing: (id: string) => Promise<void>;
    addClient: (client: Client) => Promise<void>;
    addReminder: (reminder: Reminder) => Promise<void>;
    deleteReminder: (id: string) => Promise<void>;
    addCommission: (commission: Commission) => Promise<void>;
    deleteCommission: (id: string) => Promise<void>;
    fetchData: () => Promise<void>;
    notifications: AppNotification[];
    addNotification: (message: string) => Promise<void>;
    markNotificationsAsRead: () => Promise<void>;
    selectedListing: Listing | null;
    setSelectedListing: (listing: Listing | null) => void;
    listingToEdit: Listing | null;
    setListingToEdit: (listing: Listing | null) => void;
    clientForReminder: Client | null;
    setClientForReminder: (client: Client | null) => void;
    settings: AppSettings;
    goals: string;
    updateSetting: (key: keyof AppSettings, value: boolean) => Promise<void>;
    saveGoals: (goalsText: string) => Promise<void>;
    isVoiceSessionActive: boolean;
    setVoiceSessionActive: (isActive: boolean) => void;
    liveTranscript: string;
    setLiveTranscript: (transcript: string) => void;
    permissionState: PermissionState;
    setPermissionState: (state: PermissionState) => void;
    permissionStatuses: { microphone: PermissionState; notifications: NotificationPermission };
    // FIX: Expose `setPermissionStatuses` in the context to allow child components to update the permission state object
    // without violating hook rules or directly mutating state. This is crucial for the centralized permission checker.
    setPermissionStatuses: React.Dispatch<React.SetStateAction<{ microphone: PermissionState; notifications: NotificationPermission }>>;
    requestMicrophonePermission: () => Promise<void>;
    requestNotificationPermission: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

const useApp = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error('useApp must be used within an AppProvider');
    return context;
};

const AppProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<{ role: 'admin' | 'user' } | null>({ role: 'admin' });
    const [currentPage, setCurrentPage] = useState<Page>('dashboard');
    const [activeModal, setActiveModal] = useState<Modal>(null);
    const [listings, setListings] = useState<Listing[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [commissions, setCommissions] = useState<Commission[]>([]);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
    const [listingToEdit, setListingToEdit] = useState<Listing | null>(null);
    const [clientForReminder, setClientForReminder] = useState<Client | null>(null);
    const [settings, setSettings] = useState<AppSettings>({ goalsEnabled: false, gratitudeEnabled: false });
    const [goals, setGoals] = useState<string>('');
    const [isVoiceSessionActive, setVoiceSessionActive] = useState(false);
    const [liveTranscript, setLiveTranscript] = useState('');
    const [permissionState, setPermissionState] = useState<PermissionState>('prompt');
    const [permissionStatuses, setPermissionStatuses] = useState<{ microphone: PermissionState; notifications: NotificationPermission }>({
        microphone: 'prompt',
        notifications: 'default'
    });
    
    const login = (role: 'admin' | 'user') => setUser({ role });
    const logout = () => setUser(null);

    const fetchData = useCallback(async () => {
        const db = await initDB();
        const [allListings, allClients, savedSettings, savedGoals, allReminders, allNotifications, allCommissions] = await Promise.all([
            db.getAll('listings'),
            db.getAll('clients'),
            db.get('settings', 'user-settings'),
            db.get('goals', 'user-goals'),
            db.getAll('reminders'),
            db.getAll('notifications'),
            db.getAll('commissions'),
        ]);
        setListings(allListings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setClients(allClients.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setReminders(allReminders.sort((a, b) => new Date(a.reminderDate).getTime() - new Date(b.reminderDate).getTime()));
        setNotifications(allNotifications.sort((a, b) => b.timestamp - a.timestamp));
        setCommissions(allCommissions.sort((a, b) => new Date(b.contractDate).getTime() - new Date(a.contractDate).getTime()));
        if (savedSettings) setSettings(savedSettings);
        if (savedGoals) setGoals(savedGoals.text);
    }, []);

    useEffect(() => {
        if (user) {
            fetchData().catch(err => {
                console.error("Failed to fetch initial data:", err);
            });
        }
    }, [user, fetchData]);


    const addListing = async (listing: Listing) => {
        setListings(prev => [listing, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        const db = await initDB();
        await db.put('listings', listing);
    };
    
    const updateListing = async (listing: Listing) => {
        setListings(prev => prev.map(l => l.id === listing.id ? listing : l));
        const db = await initDB();
        await db.put('listings', listing);
    };
    
    const deleteListing = async (id: string) => {
        setListings(prev => prev.filter(l => l.id !== id));
        const db = await initDB();
        await db.delete('listings', id);
    };

    const addClient = async (client: Client) => {
        setClients(prev => [client, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        const db = await initDB();
        await db.put('clients', client);
    };
    
    const addReminder = async (reminder: Reminder) => {
        setReminders(prev => [...prev, reminder].sort((a, b) => new Date(a.reminderDate).getTime() - new Date(b.reminderDate).getTime()));
        const db = await initDB();
        await db.put('reminders', reminder);
    };

    const deleteReminder = async (id: string) => {
        setReminders(prev => prev.filter(r => r.id !== id));
        const db = await initDB();
        await db.delete('reminders', id);
    };

    const addCommission = async (commission: Commission) => {
        setCommissions(prev => [...prev, commission].sort((a, b) => new Date(b.contractDate).getTime() - new Date(a.contractDate).getTime()));
        const db = await initDB();
        await db.put('commissions', commission);
    };
    
    const deleteCommission = async (id: string) => {
        setCommissions(prev => prev.filter(c => c.id !== id));
        const db = await initDB();
        await db.delete('commissions', id);
    };

    const addNotification = async (message: string) => {
        const notification: Omit<AppNotification, 'id'> = {
            message,
            read: false,
            timestamp: Date.now(),
        };
        const db = await initDB();
        const newId = await db.put('notifications', notification as any);
        setNotifications(prev => [{ ...notification, id: newId }, ...prev].sort((a, b) => b.timestamp - a.timestamp));
    };

    const markNotificationsAsRead = async () => {
        const unreadIds = new Set(notifications.filter(n => !n.read).map(n => n.id));
        if (unreadIds.size === 0) return;

        setNotifications(prev => prev.map(n => unreadIds.has(n.id) ? { ...n, read: true } : n));

        const db = await initDB();
        const tx = db.transaction('notifications', 'readwrite');
        const unreadDb = await tx.store.getAll();
        const updates = unreadDb.filter(n => !n.read).map(n => ({...n, read: true}));
        await Promise.all([...updates.map(n => tx.store.put(n)), tx.done]);
    };

    const updateSetting = async (key: keyof AppSettings, value: boolean) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        const db = await initDB();
        await db.put('settings', { key: 'user-settings', ...newSettings });
    };

    const saveGoals = async (goalsText: string) => {
        setGoals(goalsText);
        const db = await initDB();
        await db.put('goals', { key: 'user-goals', text: goalsText });
    };

    const requestMicrophonePermission = async () => {
        try {
            await unlockAudio();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
        } catch (err) {
            console.error("Microphone permission request failed.", err);
        }
    };

    const requestNotificationPermission = async () => {
        const result = await Notification.requestPermission();
        setPermissionStatuses(prev => ({...prev, notifications: result}));
    };

    const contextValue: AppContextType = {
        user, login, logout,
        currentPage, setCurrentPage,
        activeModal, setActiveModal,
        listings, clients, reminders, commissions,
        addListing, updateListing, deleteListing, addClient, addReminder, deleteReminder, addCommission, deleteCommission,
        fetchData,
        notifications, addNotification, markNotificationsAsRead,
        selectedListing, setSelectedListing,
        listingToEdit, setListingToEdit,
        clientForReminder, setClientForReminder,
        settings, goals, updateSetting, saveGoals,
        isVoiceSessionActive, setVoiceSessionActive,
        liveTranscript, setLiveTranscript,
        permissionState, setPermissionState,
        permissionStatuses, setPermissionStatuses, requestMicrophonePermission, requestNotificationPermission
    };

    return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};


// Utility Functions
// =================================
const NOTIFICATION_SOUND_BASE64 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjQ1LjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV-axB/...';

// --- Audio Logic ---
const notificationAudio = new Audio(NOTIFICATION_SOUND_BASE64);
let audioUnlocked = false;
const ttsAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
const liveOutputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
const ttsOutputNode = ttsAudioContext.createGain();
ttsOutputNode.connect(ttsAudioContext.destination);

// Base64 and PCM Audio Decoding/Encoding functions
function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function createBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
}

const playNotificationSound = () => {
    if (audioUnlocked) {
        notificationAudio.currentTime = 0;
        notificationAudio.play().catch(e => console.error("Could not play notification sound.", e));
    }
};

const unlockAudio = async () => {
    if (audioUnlocked) return;
    try {
        // Resume all suspended audio contexts. This is crucial for Web Audio API.
        await Promise.all([
            ttsAudioContext.state === 'suspended' ? ttsAudioContext.resume() : Promise.resolve(),
            liveOutputAudioContext.state === 'suspended' ? liveOutputAudioContext.resume() : Promise.resolve(),
        ]);

        // Play and pause a muted sound. This is the most robust way to unlock the HTMLMediaElement.
        notificationAudio.muted = true;
        await notificationAudio.play();
        notificationAudio.pause();
        notificationAudio.currentTime = 0;
        notificationAudio.muted = false;

        audioUnlocked = true;
        console.log("Audio contexts unlocked successfully.");
    } catch (error) {
        console.error("Audio could not be unlocked.", error);
    }
};

const speakText = async (text: string) => {
    if (!audioUnlocked) {
        console.warn("Audio not unlocked, cannot speak.");
        return;
    }
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: `Say with a friendly and clear tone: ${text}` }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            const audioBuffer = await decodeAudioData(decode(base64Audio), ttsAudioContext, 24000, 1);
            const source = ttsAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ttsOutputNode);
            source.start();
        }
    } catch (error) {
        console.error("TTS generation failed:", error);
    }
};

const toPersianDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleDateString('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
};

function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
    let sal_a, gy, gm, gd, days;
    jy += 1595;
    days = -355668 + (365 * jy) + (~~(jy / 33) * 8) + ~~(((jy % 33) + 3) / 4) + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
    gy = 400 * ~~(days / 146097);
    days %= 146097;
    if (days > 36524) {
        gy += 100 * ~~(--days / 36524);
        days %= 36524;
        if (days >= 365) days++;
    }
    gy += 4 * ~~(days / 1461);
    days %= 1461;
    if (days > 365) {
        gy += ~~((days - 1) / 365);
        days = (days - 1) % 365;
    }
    gd = days + 1;
    sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
    return [gy, gm, gd];
}

const wrap = (min: number, max: number, v: number) => {
  const rangeSize = max - min;
  return ((((v - min) % rangeSize) + rangeSize) % rangeSize) + min;
};


// UI Components
// =================================

const AuroraBackground = () => <div id="aurora-container"></div>;

const GlassCard: FC<{ children: ReactNode, className?: string, whileHover?: any }> = ({ children, className = '', whileHover }) => {
    return (
        <motion.div
            className={`bg-white/20 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg ${className}`}
            whileHover={whileHover}
            style={{ transformStyle: 'preserve-3d' }}
        >
            {children}
        </motion.div>
    );
};

const SiriSvgIcon: FC<{ size?: number, className?: string }> = ({ size = 64, className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 1024 1024" className={className}>
      <defs>
        <linearGradient id="g1" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#6EE7F9"/>
          <stop offset="50%" stopColor="#7C3AED"/>
          <stop offset="100%" stopColor="#F472B6"/>
        </linearGradient>
        <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="18" result="b"/>
          <feBlend in="SourceGraphic" in2="b"/>
        </filter>
      </defs>
      <circle cx="512" cy="512" r="460" fill="url(#g1)" opacity="0.95"/>
      <circle cx="512" cy="512" r="340" fill="none" stroke="#FFFFFF" strokeOpacity="0.12" strokeWidth="60"/>
      <g transform="translate(512,512)" filter="url(#blur)">
        <path d="M-220,0 C -140,-80 -80,-80 -20,0 C 40,80 120,120 200,20"
              fill="none" stroke="#fff" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" opacity="0.95"/>
        <path d="M-200,40 C -120,-20 -60,-40 0,-10 C 60,20 120,60 180,10"
              fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="16" strokeLinecap="round"/>
      </g>
      <g opacity="0.08">
        <circle cx="512" cy="512" r="520" fill="#fff"/>
      </g>
    </svg>
);

const LiveAiIcon: FC<{ size?: number; className?: string }> = ({ size = 64, className }) => (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0 text-white" style={{ filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.5))' }}>
            <path d="M12 2L12 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6 8L6 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M18 8L18 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <Sparkles className="absolute -top-1 -right-1 text-purple-400" size={size * 0.4} style={{ filter: 'drop-shadow(0 0 5px rgba(192, 132, 252, 0.7))' }}/>
    </div>
);

const VoiceWaveform: FC = () => {
    const barCount = 5;
    return (
        <div className="flex items-center justify-center space-x-1.5 rtl:space-x-reverse h-full">
            {Array.from({ length: barCount }).map((_, i) => (
                <motion.div
                    key={i}
                    className="w-1.5 bg-gradient-to-br from-purple-400 to-white rounded-full"
                    animate={{
                        height: ['25%', '75%', '25%'],
                    }}
                    transition={{
                        duration: 1.2,
                        ease: 'easeInOut',
                        repeat: Infinity,
                        delay: i * 0.2,
                    }}
                />
            ))}
        </div>
    );
};


const AnimatedAppName: FC<{ size?: string }> = ({ size = "text-2xl" }) => {
  return (
    <div className={`flex ${size} font-bold tracking-wider`} dir="ltr">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } }}>
            {"TEHRANAK".split("").map((char, index) => (
                <motion.span key={index} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={index > 4 ? "text-green-400" : "text-white"}>
                    {char}
                </motion.span>
            ))}
        </motion.div>
    </div>
  );
};


const DynamicIsland = () => {
    const { currentPage, notifications, markNotificationsAsRead, isVoiceSessionActive, setVoiceSessionActive, setCurrentPage, setActiveModal } = useApp();
    const [time, setTime] = useState(new Date());
    const isDashboard = currentPage === 'dashboard';
    const hasUnread = notifications.some(n => !n.read);
    const [isExpanded, setIsExpanded] = useState(isDashboard);
    const [dashboardView, setDashboardView] = useState<'appName' | 'dateTime'>('appName');

    useEffect(() => {
        setIsExpanded(isDashboard);
    }, [isDashboard]);

    // Timer to switch between app name and date/time on dashboard
    useEffect(() => {
        let intervalId: number | undefined;
        if (isDashboard && isExpanded) {
            setDashboardView('appName'); // Reset view when returning to dashboard
            intervalId = window.setInterval(() => {
                setDashboardView(prev => prev === 'appName' ? 'dateTime' : 'appName');
            }, 15000); // 15 seconds
        }
        return () => clearInterval(intervalId);
    }, [isDashboard, isExpanded]);

    const islandRef = useRef<HTMLDivElement>(null);

    // Time update logic
    useEffect(() => {
        const timeUpdateTimer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timeUpdateTimer);
    }, []);
    
    // Effect to close the island when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Do not close on dashboard, but close on other pages if expanded
            if (!isDashboard && islandRef.current && !islandRef.current.contains(event.target as Node) && isExpanded) {
                setIsExpanded(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isExpanded, isDashboard]);

    const handleIslandClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isVoiceSessionActive) {
            setVoiceSessionActive(false);
            return;
        }

        // Only allow toggling/opening on pages other than dashboard
        if (!isDashboard) {
             if (!isExpanded) {
                markNotificationsAsRead();
            }
            setIsExpanded(prev => !prev);
        }
    };

    const handleSettingsClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentPage('settings');
    };

    const handleSearchClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveModal('search');
    };

    const formattedTime = time.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false });
    const formattedDate = new Intl.DateTimeFormat('fa-IR-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }).format(time);

    return (
        <div className="fixed top-4 left-0 right-0 z-50 flex justify-between items-start h-14 px-4 pointer-events-none">
            
            <motion.button
                onClick={handleSettingsClick}
                className="text-gray-300 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors pointer-events-auto"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                whileHover={{ scale: 1.1 }}
            >
                <Settings size={22} />
            </motion.button>

            <div className="absolute left-1/2 -translate-x-1/2 pointer-events-auto">
                <motion.div
                    layout
                    ref={islandRef}
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    className="relative"
                    onClick={handleIslandClick}
                    style={{ cursor: isDashboard ? 'default' : 'pointer' }}
                >
                    <motion.div
                        className="relative bg-black border border-white/10 overflow-hidden flex items-center justify-center"
                        style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1)' }}
                        animate={{
                            width: isExpanded ? (isDashboard ? '14rem' : '20rem') : '3rem',
                            height: isExpanded ? (isDashboard ? '2.5rem' : 'auto') : '3rem',
                            minHeight: isExpanded ? (isDashboard ? '2.5rem' : '8rem') : '3rem',
                            borderRadius: isExpanded && isDashboard ? '9999px' : (isExpanded ? '32px' : '9999px'),
                        }}
                    >
                        <AnimatePresence mode="wait">
                             {isExpanded ? (
                                isDashboard ? (
                                    dashboardView === 'appName' ? (
                                        <motion.div
                                            key="dashboard-app-name"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                                        >
                                            <AnimatedAppName size="text-lg" />
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="dashboard-datetime"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                                            className="text-center"
                                        >
                                            <p className="text-xl font-bold tracking-wider">{formattedTime}</p>
                                            <p className="text-xs text-gray-400 -mt-1">{formattedDate}</p>
                                        </motion.div>
                                    )
                                ) : ( // Not on dashboard, expanded (notifications view)
                                    <motion.div
                                        key="expanded-notifications"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="w-full"
                                    >
                                        <div className="h-12 flex items-center justify-center p-3 relative">
                                            <AnimatePresence mode="wait">
                                                {isVoiceSessionActive ? (
                                                    <motion.div key="waveform" className="w-full h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><VoiceWaveform /></motion.div>
                                                ) : (
                                                    <motion.div key="app-name" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><AnimatedAppName /></motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                        <div className="border-t border-white/10 mx-2 my-2"></div>
                                        <div className="max-h-[50vh] overflow-y-auto px-2 pb-3">
                                            {notifications.length > 0 ? (
                                                notifications.map(notif => (
                                                    <div key={notif.id} className="flex items-start text-right p-2 rounded-lg hover:bg-white/5 transition-colors">
                                                        <div className="pt-1.5"><Circle size={8} className={`transition-colors ${notif.read ? 'text-transparent' : 'text-blue-500'}`} fill="currentColor"/></div>
                                                        <p className="flex-1 font-medium text-md text-white mx-3">{notif.message}</p>
                                                        <span className="text-xs text-gray-400 flex-shrink-0">{new Date(notif.timestamp).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit'})}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-center text-gray-400 py-4">اعلانی وجود ندارد.</p>
                                            )}
                                        </div>
                                    </motion.div>
                                )
                            ) : ( // Minimized view
                                <motion.div
                                    key="minimized-content"
                                    className="w-full h-full relative flex items-center justify-center"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                >
                                    <motion.div 
                                        className="absolute inset-[-4px] rounded-full"
                                        style={{ background: 'conic-gradient(from 180deg at 50% 50%, #a855f7, #ec4899, #67e8f9, #a855f7)', filter: 'blur(8px)', zIndex: -1 }}
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                                    />
                                    <div className={`w-3 h-3 rounded-full transition-colors duration-300 ${hasUnread ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]'}`} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </motion.div>
            </div>

            <motion.button
                onClick={handleSearchClick}
                className="text-gray-300 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors pointer-events-auto"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                whileHover={{ scale: 1.1 }}
            >
                <Search size={22} />
            </motion.button>
        </div>
    );
};

// Form Components
// ===================================
const FormInput = ({ label, ...props }: any) => (
    <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        <input className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/50 transition" {...props} />
    </div>
);

const FormSelect = ({ label, children, ...props }: any) => (
     <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        <select className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/50 transition appearance-none" {...props}>
            {children}
        </select>
    </div>
);

const FormTextarea = ({ label, ...props }: any) => (
    <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        <textarea className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/50 transition" {...props}></textarea>
    </div>
);

const FormCheckbox = ({ label, ...props }: any) => (
    <div className="flex items-center mb-4">
        <input type="checkbox" className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-white focus:ring-white/50" {...props} />
        <label className="mr-2 text-sm text-gray-300">{label}</label>
    </div>
);

const FormImageUploader = ({ onImagesChange, existingImages = [] }: { onImagesChange: (base64Images: string[]) => void, existingImages?: string[] }) => {
    const [previews, setPreviews] = useState<string[]>(existingImages);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setPreviews(existingImages);
    }, [existingImages]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            const files = Array.from(event.target.files);
            const imagePromises: Promise<string>[] = [];
            const newPreviews: string[] = [];

            files.forEach((file: File) => {
                newPreviews.push(URL.createObjectURL(file));
                imagePromises.push(new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                }));
            });
            
            const combinedPreviews = [...previews, ...newPreviews];
            setPreviews(combinedPreviews);

            Promise.all(imagePromises).then(base64Images => {
                onImagesChange([...existingImages, ...base64Images]);
            });
        }
    };
    
    return (
        <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">عکس‌ها</label>
            <div
                className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-gray-500 transition"
                onClick={() => fileInputRef.current?.click()}
            >
                <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-400">برای آپلود کلیک کنید</p>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                />
            </div>
            {previews.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-4">
                    {previews.map((src, index) => (
                        <img key={index} src={src} alt={`preview ${index}`} className="w-full h-24 object-cover rounded-md" />
                    ))}
                </div>
            )}
        </div>
    );
};

const JalaliDateTimePicker: FC<{
    value: { year: string; month: string; day: string; hour: string; minute: string; };
    onChange: (part: 'year' | 'month' | 'day' | 'hour' | 'minute', value: string) => void;
}> = ({ value, onChange }) => {
    const currentYear = 1403;
    const years = Array.from({ length: 10 }, (_, i) => currentYear + i);
    const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
    const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, '0'));
    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

    const selectClassName = "w-full bg-gray-800/60 border border-gray-700 rounded-lg px-2 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/50 transition appearance-none text-center";

    return (
        <div className="space-y-3 p-2 bg-black/20 rounded-lg">
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 text-center">تاریخ یادآوری</label>
                <div className="grid grid-cols-3 gap-2">
                    <select value={value.year} onChange={e => onChange('year', e.target.value)} className={selectClassName}>
                        <option value="" disabled>سال</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select value={value.month} onChange={e => onChange('month', e.target.value)} className={selectClassName}>
                        <option value="" disabled>ماه</option>
                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select value={value.day} onChange={e => onChange('day', e.target.value)} className={selectClassName}>
                        <option value="" disabled>روز</option>
                        {days.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 text-center">ساعت</label>
                <div className="grid grid-cols-2 gap-2">
                    <select value={value.hour} onChange={e => onChange('hour', e.target.value)} className={selectClassName}>
                        {hours.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <select value={value.minute} onChange={e => onChange('minute', e.target.value)} className={selectClassName}>
                        {minutes.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
            </div>
        </div>
    );
};


// Page & Modal Components
// =================================
const GoalSettingModal = () => {
    const { goals, saveGoals, setActiveModal } = useApp();
    const [text, setText] = useState(goals);

    const handleSave = () => {
        saveGoals(text);
        setActiveModal(null);
    };

    return (
        <div className="p-1">
            <h3 className="text-xl font-bold mb-4 text-white">ثبت و ویرایش اهداف</h3>
            <p className="text-sm text-gray-400 mb-4">اهداف خود را اینجا بنویسید. دستیار هوشمند از آن‌ها برای ارسال پیام‌های انگیزشی روزانه استفاده خواهد کرد.</p>
            <FormTextarea 
                label="اهداف شما" 
                rows={8}
                value={text}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
                placeholder="مثال: خرید خانه جدید، افزایش فروش، یادگیری یک مهارت جدید..."
            />
            <motion.button 
                onClick={handleSave}
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }} 
                className="w-full mt-4 bg-white/20 text-white font-bold py-2 px-4 rounded-lg hover:bg-white/30 transition"
            >
                ذخیره اهداف
            </motion.button>
        </div>
    );
};

const AddResidentialListingForm = ({ listingToEdit }: { listingToEdit?: Listing }) => {
    const { addListing, updateListing, setActiveModal, setListingToEdit } = useApp();
    const isEditMode = !!listingToEdit;
    const DRAFT_KEY = 'tehranak-draft-residential';

    const getInitialState = useCallback(() => {
        const defaultState = {
            id: '', createdAt: '', type: 'residential', images: [], transactionType: 'sale',
            address: '', area: '', ownerName: '', ownerPhone: '', bedrooms: '', floor: '',
            buildYear: '', hasElevator: false, hasParking: false, hasWarehouse: false,
            totalPrice: '', deposit: '', monthlyRent: '', deedStatus: 'تک‌برگ', description: ''
        };
        if (isEditMode) return { ...defaultState, ...listingToEdit };

        try {
            const savedDraft = localStorage.getItem(DRAFT_KEY);
            if (savedDraft) return JSON.parse(savedDraft);
        } catch (error) {
            console.error("Failed to parse draft:", error);
        }
        return defaultState;
    }, [isEditMode, listingToEdit]);

    const [formData, setFormData] = useState(getInitialState);

    useEffect(() => {
        if (!isEditMode) {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
        }
    }, [formData, isEditMode]);

    // FIX: Changed event type from ChangeEvent to FormEvent to match the form's onChange handler.
    // This resolves a TypeScript error when using event delegation on the form.
    const handleChange = (e: React.FormEvent<HTMLFormElement>) => {
        const target = e.target as HTMLInputElement;
        const { name, value, type } = target;
        const isCheckbox = type === 'checkbox';
        setFormData(prev => ({
            ...prev,
            [name]: isCheckbox ? target.checked : value
        }));
    };
    
    const handleImagesChange = (newImages: string[]) => {
        setFormData(prev => ({ ...prev, images: newImages }));
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        const listingData: Listing = {
            ...formData,
            id: isEditMode ? listingToEdit.id : crypto.randomUUID(),
            createdAt: isEditMode ? listingToEdit.createdAt : new Date().toISOString(),
            area: Number(formData.area),
            bedrooms: Number(formData.bedrooms),
            floor: Number(formData.floor),
            buildYear: Number(formData.buildYear),
            totalPrice: formData.totalPrice ? Number(formData.totalPrice) : undefined,
            deposit: formData.deposit ? Number(formData.deposit) : undefined,
            monthlyRent: formData.monthlyRent ? Number(formData.monthlyRent) : undefined,
        };

        if (isEditMode) {
            await updateListing(listingData);
        } else {
            await addListing(listingData);
            localStorage.removeItem(DRAFT_KEY);
        }
        
        setActiveModal(null);
        if(isEditMode) setListingToEdit(null);
    };

    return (
        <form onSubmit={handleSubmit} onChange={handleChange} className="p-1">
            <h3 className="text-xl font-bold mb-4 text-white">{isEditMode ? 'ویرایش ملک مسکونی' : 'ثبت ملک مسکونی'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <FormSelect label="نوع ملک" name="propertyType" value={formData.type === 'residential' ? "apartment" : formData.type}>
                    <option value="apartment">آپارتمان</option>
                    <option value="house">خانه</option>
                    <option value="villa">ویلایی</option>
                    <option value="land">زمین</option>
                </FormSelect>
                <FormSelect label="نوع معامله" name="transactionType" value={formData.transactionType}>
                    <option value="sale">فروش</option>
                    <option value="rent">اجاره</option>
                    <option value="presale">پیش‌فروش</option>
                </FormSelect>
            </div>
            <FormInput label="آدرس" name="address" required value={formData.address}/>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4">
                <FormInput label="متراژ" name="area" type="number" required value={formData.area}/>
                <FormInput label="تعداد خواب" name="bedrooms" type="number" value={formData.bedrooms}/>
                <FormInput label="طبقه" name="floor" type="number" value={formData.floor}/>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <FormInput label="سال ساخت" name="buildYear" type="number" value={formData.buildYear}/>
                <FormSelect label="وضعیت سند" name="deedStatus" value={formData.deedStatus}>
                    <option>تک‌برگ</option>
                    <option>قولنامه‌ای</option>
                    <option>اوقافی</option>
                    <option>در دست اقدام</option>
                </FormSelect>
            </div>
            {formData.transactionType === 'sale' || formData.transactionType === 'presale' ? (
                <FormInput label="قیمت کل (تومان)" name="totalPrice" type="number" required value={formData.totalPrice}/>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <FormInput label="ودیعه (تومان)" name="deposit" type="number" required value={formData.deposit}/>
                    <FormInput label="اجاره ماهانه (تومان)" name="monthlyRent" type="number" required value={formData.monthlyRent}/>
                </div>
            )}
             <div className="flex space-x-4 rtl:space-x-reverse justify-around my-4">
                <FormCheckbox label="آسانسور" name="hasElevator" checked={formData.hasElevator} />
                <FormCheckbox label="پارکینگ" name="hasParking" checked={formData.hasParking} />
                <FormCheckbox label="انباری" name="hasWarehouse" checked={formData.hasWarehouse} />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <FormInput label="نام مالک" name="ownerName" required value={formData.ownerName}/>
                <FormInput label="شماره تماس مالک" name="ownerPhone" type="tel" required value={formData.ownerPhone}/>
            </div>
            <FormImageUploader onImagesChange={handleImagesChange} existingImages={formData.images} />
            <FormTextarea label="توضیحات" name="description" rows={3} value={formData.description}/>
            <motion.button type="submit" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-full mt-4 bg-white/20 text-white font-bold py-2 px-4 rounded-lg hover:bg-white/30 transition">
                {isEditMode ? 'ذخیره تغییرات' : 'ثبت'}
            </motion.button>
        </form>
    );
};

const AddCommercialListingForm = ({ listingToEdit }: { listingToEdit?: Listing }) => {
    const { addListing, updateListing, setActiveModal, setListingToEdit } = useApp();
    const isEditMode = !!listingToEdit;
    const DRAFT_KEY = 'tehranak-draft-commercial';

    const getInitialState = useCallback(() => {
        const defaultState = {
            type: 'commercial', transactionType: 'sale', images: [], address: '', area: '', ownerName: '',
            ownerPhone: '', description: '', commercialType: 'مغازه', frontWidth: '', length: '',
            ceilingHeight: '', hasOpenCeiling: false, locationType: 'بر خیابان اصلی',
            commercialDeedStatus: 'تک‌برگ', currentStatus: 'تخلیه', totalPrice: '', deposit: '', monthlyRent: ''
        };
        if (isEditMode) return { ...defaultState, ...listingToEdit };
        try {
            const savedDraft = localStorage.getItem(DRAFT_KEY);
            if (savedDraft) return JSON.parse(savedDraft);
        } catch (error) {
            console.error("Failed to parse draft:", error);
        }
        return defaultState;
    }, [isEditMode, listingToEdit]);

    const [formData, setFormData] = useState(getInitialState);

    useEffect(() => {
        if (!isEditMode) {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
        }
    }, [formData, isEditMode]);

    // FIX: Changed event type from ChangeEvent to FormEvent to match the form's onChange handler.
    // This resolves a TypeScript error when using event delegation on the form.
    const handleChange = (e: React.FormEvent<HTMLFormElement>) => {
        const target = e.target as HTMLInputElement;
        const { name, value, type } = target;
        const isCheckbox = type === 'checkbox';
        setFormData(prev => ({
            ...prev,
            [name]: isCheckbox ? target.checked : value
        }));
    };

    const handleImagesChange = (newImages: string[]) => {
        setFormData(prev => ({ ...prev, images: newImages }));
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const listingData: Listing = {
            ...formData,
            id: isEditMode ? listingToEdit.id : crypto.randomUUID(),
            createdAt: isEditMode ? listingToEdit.createdAt : new Date().toISOString(),
            area: Number(formData.area),
            frontWidth: Number(formData.frontWidth),
            length: Number(formData.length),
            ceilingHeight: Number(formData.ceilingHeight),
            totalPrice: formData.totalPrice ? Number(formData.totalPrice) : undefined,
            deposit: formData.deposit ? Number(formData.deposit) : undefined,
            monthlyRent: formData.monthlyRent ? Number(formData.monthlyRent) : undefined,
        };

        if(isEditMode) {
            await updateListing(listingData);
        } else {
            await addListing(listingData);
            localStorage.removeItem(DRAFT_KEY);
        }

        setActiveModal(null);
        if(isEditMode) setListingToEdit(null);
    };

    return (
        <form onSubmit={handleSubmit} onChange={handleChange} className="p-1">
            <h3 className="text-xl font-bold mb-4 text-white">{isEditMode ? 'ویرایش ملک تجاری' : 'ثبت ملک تجاری'}</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <FormSelect label="نوع ملک تجاری" name="commercialType" value={formData.commercialType}>
                    <option>مغازه</option>
                    <option>دفتر کار</option>
                    <option>کارگاه</option>
                    <option>انبار</option>
                </FormSelect>
                <FormSelect label="نوع معامله" name="transactionType" value={formData.transactionType}>
                    <option value="sale">فروش</option>
                    <option value="rent">اجاره</option>
                    <option value="partnership">مشارکت</option>
                </FormSelect>
            </div>
            <FormInput label="آدرس" name="address" required value={formData.address} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4">
                <FormInput label="متراژ" name="area" type="number" required value={formData.area}/>
                <FormInput label="عرض بر (متر)" name="frontWidth" type="number" value={formData.frontWidth} />
                <FormInput label="ارتفاع سقف (متر)" name="ceilingHeight" type="number" value={formData.ceilingHeight}/>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <FormSelect label="موقعیت ملک" name="locationType" value={formData.locationType}>
                    <option>بر خیابان اصلی</option>
                    <option>داخل پاساژ</option>
                    <option>داخل کوچه</option>
                </FormSelect>
                <FormSelect label="نوع سند" name="commercialDeedStatus" value={formData.commercialDeedStatus}>
                    <option>تک‌برگ</option>
                    <option>سرقفلی</option>
                    <option>اجاره‌نامه</option>
                </FormSelect>
            </div>
            {formData.transactionType === 'sale' || formData.transactionType === 'partnership' ? (
                <FormInput label="قیمت کل (تومان)" name="totalPrice" type="number" required value={formData.totalPrice} />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <FormInput label="ودیعه (تومان)" name="deposit" type="number" required value={formData.deposit}/>
                    <FormInput label="اجاره ماهانه (تومان)" name="monthlyRent" type="number" required value={formData.monthlyRent}/>
                </div>
            )}
             <FormSelect label="وضعیت فعلی ملک" name="currentStatus" value={formData.currentStatus}>
                <option>تخلیه</option>
                <option>در اجاره</option>
                <option>فعال</option>
            </FormSelect>
             <div className="my-4">
                <FormCheckbox label="سقف آزاد" name="hasOpenCeiling" checked={formData.hasOpenCeiling}/>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <FormInput label="نام مالک" name="ownerName" required value={formData.ownerName}/>
                <FormInput label="شماره تماس مالک" name="ownerPhone" type="tel" required value={formData.ownerPhone}/>
            </div>
            <FormImageUploader onImagesChange={handleImagesChange} existingImages={formData.images} />
            <FormTextarea label="توضیحات" name="description" rows={3} value={formData.description}/>
            <motion.button type="submit" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-full mt-4 bg-white/20 text-white font-bold py-2 px-4 rounded-lg hover:bg-white/30 transition">
                {isEditMode ? 'ذخیره تغییرات' : 'ثبت'}
            </motion.button>
        </form>
    );
};


const AddClientForm = () => {
    const { addClient, addReminder, setActiveModal } = useApp();
    const DRAFT_KEY = 'tehranak-draft-client';
    
    const getInitialState = () => {
        const defaultState = {
            name: '', phone: '', requestType: 'buy', propertyType: 'residential',
            budgetFrom: '', budgetTo: '', areaFrom: '', areaTo: '',
            location: '', requiredFeatures: '', description: '',
            isAddingReminder: false,
            reminderDateTime: { year: '', month: '', day: '', hour: '09', minute: '00' },
            reminderNotes: '',
        };
        try {
            const savedDraft = localStorage.getItem(DRAFT_KEY);
            if (savedDraft) return JSON.parse(savedDraft);
        } catch (e) { console.error("Failed to parse client draft:", e); }
        return defaultState;
    };
    
    const [formData, setFormData] = useState(getInitialState);
    const [error, setError] = useState('');

    useEffect(() => {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
    }, [formData]);

    // FIX: Changed event type from ChangeEvent to FormEvent to match the form's onChange handler.
    // This resolves a TypeScript error when using event delegation on the form.
    const handleChange = (e: React.FormEvent<HTMLFormElement>) => {
        const target = e.target as HTMLInputElement;
        const { name, value, type } = target;
        const isCheckbox = type === 'checkbox';
        setFormData(prev => ({
            ...prev,
            [name]: isCheckbox ? target.checked : value
        }));
    };
    
    const handleReminderDateTimeChange = (part: keyof typeof formData.reminderDateTime, value: string) => {
        setFormData(prev => ({
            ...prev,
            reminderDateTime: { ...prev.reminderDateTime, [part]: value }
        }));
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');

        if (formData.isAddingReminder) {
            if (!formData.reminderDateTime.year || !formData.reminderDateTime.month || !formData.reminderDateTime.day) {
                setError('لطفا تاریخ یادآوری را به صورت کامل انتخاب کنید.');
                return;
            }
            if (formData.reminderNotes.trim() === '') {
                setError('لطفا یادداشت یادآوری را وارد کنید.');
                return;
            }
        }
        
        const newClient: Client = {
            id: crypto.randomUUID(),
            name: formData.name,
            phone: formData.phone,
            requestType: formData.requestType as 'buy' | 'rent' | 'mortgage',
            propertyType: formData.propertyType as 'residential' | 'commercial' | 'office',
            budgetFrom: Number(formData.budgetFrom),
            budgetTo: Number(formData.budgetTo),
            areaFrom: Number(formData.areaFrom),
            areaTo: Number(formData.areaTo),
            location: formData.location,
            requiredFeatures: formData.requiredFeatures,
            description: formData.description,
            createdAt: new Date().toISOString(),
        };

        await addClient(newClient);
        
        if (formData.isAddingReminder) {
            const { year, month, day, hour, minute } = formData.reminderDateTime;
            const [gy, gm, gd] = jalaliToGregorian(Number(year), Number(month), Number(day));
            const gregorianReminderDate = new Date(gy, gm - 1, gd, Number(hour), Number(minute));

            const newReminder: Reminder = {
                id: crypto.randomUUID(),
                clientId: newClient.id,
                clientName: newClient.name,
                reminderDate: gregorianReminderDate.toISOString(),
                notes: formData.reminderNotes,
                createdAt: new Date().toISOString(),
            };
            await addReminder(newReminder);
        }
        
        localStorage.removeItem(DRAFT_KEY);
        setActiveModal(null);
    };

    return (
        <form onSubmit={handleSubmit} onChange={handleChange} className="p-1">
            <h3 className="text-xl font-bold mb-4 text-white">ثبت مشتری</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <FormInput label="نام مشتری" name="name" required value={formData.name} />
                <FormInput label="شماره تماس" name="phone" type="tel" required value={formData.phone} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <FormSelect label="نوع درخواست" name="requestType" value={formData.requestType}>
                    <option value="buy">خرید</option>
                    <option value="rent">اجاره</option>
                    <option value="mortgage">رهن</option>
                </FormSelect>
                <FormSelect label="نوع ملک مورد نظر" name="propertyType" value={formData.propertyType}>
                    <option value="residential">مسکونی</option>
                    <option value="commercial">تجاری</option>
                    <option value="office">اداری</option>
                </FormSelect>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <FormInput label="بودجه از (تومان)" name="budgetFrom" type="number" value={formData.budgetFrom} />
                <FormInput label="بودجه تا (تومان)" name="budgetTo" type="number" value={formData.budgetTo} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <FormInput label="متراژ از (متر)" name="areaFrom" type="number" value={formData.areaFrom} />
                <FormInput label="متراژ تا (متر)" name="areaTo" type="number" value={formData.areaTo} />
            </div>
             <FormInput label="محدوده / منطقه مورد نظر" name="location" value={formData.location} />
             <FormInput label="امکانات یا ویژگی‌های ضروری" name="requiredFeatures" value={formData.requiredFeatures} />
             <FormTextarea label="توضیحات اضافی" name="description" rows={3} value={formData.description} />
             
             <div className="border-t border-white/10 my-6"></div>

            <div className="space-y-4">
                <FormCheckbox 
                    label="ثبت یادآوری برای این مشتری" 
                    name="isAddingReminder"
                    checked={formData.isAddingReminder}
                />

                <AnimatePresence>
                    {formData.isAddingReminder && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden space-y-4"
                        >
                            <JalaliDateTimePicker
                                value={formData.reminderDateTime}
                                onChange={handleReminderDateTimeChange}
                            />
                            <FormTextarea 
                                label="یادداشت"
                                name="reminderNotes"
                                rows={3}
                                value={formData.reminderNotes}
                                placeholder="مثال: تماس برای پیگیری پیشنهاد قیمت..."
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {error && <p className="text-red-400 text-sm my-4 text-center">{error}</p>}

             <motion.button type="submit" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-full mt-4 bg-white/20 text-white font-bold py-2 px-4 rounded-lg hover:bg-white/30 transition">
                ثبت مشتری
            </motion.button>
        </form>
    );
};

const AddReminderForm = () => {
    const { addReminder, setActiveModal, clientForReminder, setClientForReminder } = useApp();
    const [dateTime, setDateTime] = useState({ year: '', month: '', day: '', hour: '09', minute: '00' });
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');

    if (!clientForReminder) return null;

     const handleDateTimeChange = (part: keyof typeof dateTime, value: string) => {
        setDateTime(prev => ({ ...prev, [part]: value }));
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!dateTime.year || !dateTime.month || !dateTime.day) {
            setError('لطفا تاریخ را به صورت کامل انتخاب کنید.');
            return;
        }
        if (notes.trim() === '') {
            setError('لطفا یادداشت یادآوری را وارد کنید.');
            return;
        }
        setError('');

        const { year, month, day, hour, minute } = dateTime;
        const [gy, gm, gd] = jalaliToGregorian(Number(year), Number(month), Number(day));
        const reminderDate = new Date(gy, gm - 1, gd, Number(hour), Number(minute));

        const newReminder: Reminder = {
            id: crypto.randomUUID(),
            clientId: clientForReminder.id,
            clientName: clientForReminder.name,
            reminderDate: reminderDate.toISOString(),
            notes: notes,
            createdAt: new Date().toISOString(),
        };

        await addReminder(newReminder);
        setActiveModal(null);
        setClientForReminder(null);
    };
    
    return (
        <form onSubmit={handleSubmit} className="p-1 space-y-4">
            <div>
                <h3 className="text-xl font-bold mb-2 text-white">ثبت یادآوری</h3>
                <p className="text-md text-gray-300">برای مشتری: <span className="font-semibold">{clientForReminder.name}</span></p>
            </div>
            <JalaliDateTimePicker
                value={dateTime}
                onChange={handleDateTimeChange}
            />
            <FormTextarea 
                label="یادداشت"
                rows={4}
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                placeholder="مثال: تماس برای پیگیری پیشنهاد قیمت..."
                required
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <motion.button type="submit" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-full mt-2 bg-white/20 text-white font-bold py-2 px-4 rounded-lg hover:bg-white/30 transition">
                ثبت یادآوری
            </motion.button>
        </form>
    );
};

const AddCommissionForm = () => {
    const { addCommission, setActiveModal } = useApp();
    const [date, setDate] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        const dateRegex = /^(1[34]\d{2})\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/;
        if (date && !dateRegex.test(date)) {
            setError('فرمت تاریخ صحیح نیست. لطفا از فرمت YYYY/MM/DD استفاده کنید.');
            return;
        }
        
        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries());
        
        let gregorianDate = new Date();
        if (date) {
            const [year, month, day] = date.split('/').map(Number);
            const [gy, gm, gd] = jalaliToGregorian(year, month, day);
            gregorianDate = new Date(gy, gm - 1, gd);
        }

        const newCommission: Commission = {
            id: crypto.randomUUID(),
            buyerName: data.buyerName as string,
            sellerName: data.sellerName as string,
            contractDate: gregorianDate.toISOString(),
            totalCommission: Number(data.totalCommission),
            consultantShare: Number(data.consultantShare),
            createdAt: new Date().toISOString(),
        };

        await addCommission(newCommission);
        setActiveModal(null);
    };
    
    return (
        <form onSubmit={handleSubmit} className="p-1">
            <h3 className="text-xl font-bold mb-4 text-white">ثبت کمیسیون</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <FormInput label="نام خریدار" name="buyerName" required />
                <FormInput label="نام فروشنده" name="sellerName" required />
            </div>
            <FormInput 
                label="تاریخ قرارداد (شمسی)"
                value={date}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value)}
                placeholder="مثال: 1403/05/27"
                required
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <FormInput label="مبلغ کمیسیون دریافتی" name="totalCommission" type="number" required />
                <FormInput label="سهم شما (مشاور)" name="consultantShare" type="number" required />
            </div>
            {error && <p className="text-red-400 text-sm my-2">{error}</p>}
            <motion.button type="submit" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-full mt-4 bg-white/20 text-white font-bold py-2 px-4 rounded-lg hover:bg-white/30 transition">
                ثبت
            </motion.button>
        </form>
    );
};

// FIX: Make children optional to resolve a TypeScript error where it's incorrectly reported as missing.
const ModalContainer = ({ children, onClose, fullScreen = false }: { children?: ReactNode, onClose: () => void, fullScreen?: boolean }) => {
    const modalVariants = fullScreen
        ? {
            initial: { opacity: 0, y: "100vh" },
            animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 20 } },
            exit: { opacity: 0, y: "100vh", transition: { duration: 0.3 } },
          }
        : {
            initial: { scale: 0.9, y: 20 },
            animate: { scale: 1, y: 0 },
            exit: { scale: 0.9, y: 20 },
          };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-0 md:p-4"
            onClick={onClose}
        >
            <motion.div
                variants={modalVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className={fullScreen ? "w-full h-full" : "w-full max-w-lg"}
                onClick={(e) => e.stopPropagation()}
            >
                <GlassCard className={`p-0 md:p-6 relative ${fullScreen ? "w-full h-full rounded-none md:rounded-2xl" : ""} max-h-screen md:max-h-[90vh] overflow-hidden flex flex-col`}>
                     <button onClick={onClose} className="absolute top-4 left-4 text-gray-200 hover:text-white transition z-50 bg-black/50 rounded-full p-1">
                        <X />
                    </button>
                    <div className="overflow-y-auto w-full h-full">
                         {children}
                    </div>
                </GlassCard>
            </motion.div>
        </motion.div>
    );
};

const AddListingMenu: FC<{ onSelect: (modal: Modal) => void; onClose: () => void }> = ({ onSelect, onClose }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                const navButton = document.querySelector('[aria-label="افزودن جدید"]');
                if (navButton && navButton.contains(event.target as Node)) {
                    return;
                }
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [onClose]);

    const menuItems = [
        { label: 'ثبت مسکونی', icon: <Home size={20} />, modal: 'add-residential' as Modal },
        { label: 'ثبت تجاری', icon: <Building size={20} />, modal: 'add-commercial' as Modal },
        { label: 'ثبت مشتری', icon: <UserPlus size={20} />, modal: 'add-client' as Modal },
        { label: 'ثبت کمیسیون', icon: <FilePlus size={20} />, modal: 'add-commission' as Modal },
    ];

    return (
        <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute bottom-[100px] left-1/2 -translate-x-1/2 z-30 w-52"
        >
            <GlassCard className="p-2 space-y-1">
                {menuItems.map((item, index) => (
                    <motion.button
                        key={item.modal}
                        onClick={() => onSelect(item.modal)}
                        className="w-full flex items-center text-right rtl:text-right px-4 py-3 text-white rounded-lg hover:bg-white/10 transition-colors"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0, transition: { delay: index * 0.05 } }}
                    >
                        {item.icon}
                        <span className="mr-3">{item.label}</span>
                    </motion.button>
                ))}
            </GlassCard>
        </motion.div>
    );
};

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => {
    return Math.abs(offset) * velocity;
};

const sliderVariants = {
    enter: (direction: number) => ({
        x: direction > 0 ? '100%' : '-100%',
        opacity: 0,
    }),
    center: {
        zIndex: 1,
        x: 0,
        opacity: 1,
    },
    exit: (direction: number) => ({
        zIndex: 0,
        x: direction < 0 ? '100%' : '-100%',
        opacity: 0,
    }),
};

const FeaturedSlider: FC<{ listings: Listing[] }> = ({ listings }) => {
    const featuredListings = listings.filter(l => l.images && l.images.length > 0).slice(0, 5);
    const [[page, direction], setPage] = useState([0, 0]);

    const listingIndex = wrap(0, featuredListings.length, page);

    const paginate = useCallback((newDirection: number) => {
        setPage([page + newDirection, newDirection]);
    }, [page]);

    useEffect(() => {
        if(featuredListings.length <= 1) return;
        const timer = setTimeout(() => paginate(1), 5000);
        return () => clearTimeout(timer);
    }, [page, paginate, featuredListings.length]);


    if (featuredListings.length === 0) {
        return (
            <div className="relative w-full h-56 md:h-64 flex items-center justify-center overflow-hidden rounded-2xl mb-6 shadow-lg border border-white/10 bg-white/5">
                <div className="text-center text-gray-400">
                    <p>هنوز آگهی ویژه‌ای برای نمایش وجود ندارد.</p>
                    <p className="text-sm mt-1">با افزودن عکس به آگهی‌ها، در اینجا نمایش داده می‌شوند.</p>
                </div>
            </div>
        );
    }
    
    const listing = featuredListings[listingIndex];

    const transactionTypeMap = {
        sale: 'فروش',
        rent: 'اجاره',
        presale: 'پیش‌فروش',
        partnership: 'مشارکت'
    };


    return (
        <div className="relative w-full h-56 md:h-64 flex items-center justify-center overflow-hidden rounded-2xl mb-6 shadow-lg border border-white/10 bg-white/5">
            <AnimatePresence initial={false} custom={direction}>
                <motion.div
                    key={page}
                    className="w-full h-full absolute"
                    custom={direction}
                    variants={sliderVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                        x: { type: 'spring', stiffness: 300, damping: 30 },
                        opacity: { duration: 0.2 },
                    }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={1}
                    onDragEnd={(e, { offset, velocity }) => {
                        const swipe = swipePower(offset.x, velocity.x);
                        if (swipe < -swipeConfidenceThreshold) {
                            paginate(1);
                        } else if (swipe > swipeConfidenceThreshold) {
                            paginate(-1);
                        }
                    }}
                >
                    <img src={listing.images[0]} className="w-full h-full object-cover" alt={listing.address} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="absolute bottom-0 right-0 p-4 text-white" style={{textShadow: '0 2px 4px rgba(0,0,0,0.8)'}}>
                        <h3 className="font-bold text-lg">{listing.address}</h3>
                        <div className="flex items-center justify-between mt-1">
                            <p className="text-md font-semibold text-green-300">
                                 {listing.totalPrice ? `${listing.totalPrice.toLocaleString('fa-IR')} تومان` : `${listing.deposit?.toLocaleString('fa-IR')} / ${listing.monthlyRent?.toLocaleString('fa-IR')}`}
                            </p>
                            <span className="text-xs bg-white/20 backdrop-blur-sm px-2 py-1 rounded-full">{transactionTypeMap[listing.transactionType]}</span>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex space-x-2 rtl:space-x-reverse z-10">
                {featuredListings.map((_, i) => (
                    <button
                        key={i}
                        onClick={() => setPage([i, i > listingIndex ? 1 : -1])}
                        className={`w-2 h-2 rounded-full transition-colors ${i === listingIndex ? 'bg-white' : 'bg-white/50 hover:bg-white/75'}`}
                        aria-label={`Go to slide ${i + 1}`}
                     />
                ))}
            </div>
        </div>
    );
};

const DashboardPage = () => {
    const { listings, clients } = useApp();

    const StatCard = ({ title, value, icon }: { title: string, value: string | number, icon: ReactNode }) => (
        <GlassCard 
            className="p-4 flex items-center"
            whileHover={{ y: -5, transition: { type: 'spring', stiffness: 300 } }}
        >
            <div className="p-3 bg-white/10 rounded-full mr-4">{icon}</div>
            <div>
                <p className="text-gray-300 text-sm">{title}</p>
                <p className="text-white text-2xl font-bold">{value}</p>
            </div>
        </GlassCard>
    );

    return (
        <div className="p-4 space-y-6">
            <FeaturedSlider listings={listings} />
            <h2 className="text-3xl font-bold text-white">داشبورد</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatCard title="کل آگهی‌ها" value={listings.length} icon={<Home size={24} className="text-white" />} />
                <StatCard title="کل مشتریان" value={clients.length} icon={<Users size={24} className="text-white" />} />
                <StatCard title="معاملات این ماه" value="۳" icon={<Check size={24} className="text-white" />} />
                <StatCard title="وظایف امروز" value="۵" icon={<Star size={24} className="text-white" />} />
            </div>

            <div>
                 <h3 className="text-xl font-bold text-white mb-4">آگهی‌های اخیر</h3>
                 <div className="space-y-4">
                     {listings.slice(0, 3).map(listing => <ListingCard key={listing.id} listing={listing} />)}
                 </div>
            </div>
        </div>
    );
};

const ListingCard: FC<{ listing: Listing, onClick?: () => void }> = ({ listing, onClick }) => {
    const { setSelectedListing } = useApp();
    const controls = useAnimation();
    const ref = useRef(null);

    const handleCardClick = () => {
        if (onClick) {
            onClick();
        }
        setSelectedListing(listing);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!ref.current) return;
        const rect = (ref.current as HTMLDivElement).getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        controls.start({
            rotateX: -y / 40,
            rotateY: x / 40,
            scale: 1.05,
            transition: { type: "spring", stiffness: 400, damping: 20 }
        });
    };

    const handleMouseLeave = () => {
        controls.start({ rotateX: 0, rotateY: 0, scale: 1 });
    };

    return (
        <motion.div
            ref={ref}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleCardClick}
            animate={controls}
            style={{ transformStyle: 'preserve-3d', perspective: 800, cursor: 'pointer' }}
        >
        <GlassCard className="p-4 flex space-x-4 rtl:space-x-reverse items-start overflow-hidden">
            <img src={listing.images[0] || 'https://via.placeholder.com/150'} alt="property" className="w-24 h-24 rounded-lg object-cover" />
            <div className="flex-1">
                <p className="font-bold text-lg text-white truncate">{listing.address}</p>
                <p className="text-sm text-gray-300">{listing.type === 'residential' ? 'مسکونی' : 'تجاری'}</p>
                <div className="flex items-center text-gray-400 text-xs mt-2 space-x-3 rtl:space-x-reverse">
                    <span className="flex items-center"><Building2 size={14} className="ml-1" /> {listing.area} متر</span>
                    {listing.bedrooms && <span className="flex items-center"><BedDouble size={14} className="ml-1" /> {listing.bedrooms} خواب</span>}
                </div>
                 <p className="text-lg font-bold text-white mt-2">
                    {listing.totalPrice ? `${listing.totalPrice.toLocaleString('fa-IR')} تومان` : `${listing.deposit?.toLocaleString('fa-IR')} / ${listing.monthlyRent?.toLocaleString('fa-IR')}`}
                </p>
            </div>
        </GlassCard>
        </motion.div>
    );
};

const ListingsPage = () => {
    const { listings } = useApp();
    return (
        <div className="p-4">
            <h2 className="text-3xl font-bold text-white mb-6">لیست آگهی‌ها</h2>
            {listings.length === 0 ? (
                <p className="text-center text-gray-400">هنوز آگهی ثبت نشده است.</p>
            ) : (
                <div className="space-y-4">
                    {listings.map(listing => <ListingCard key={listing.id} listing={listing} />)}
                </div>
            )}
        </div>
    );
};

const ClientCard: FC<{ client: Client }> = ({ client }) => {
    const { setActiveModal, setClientForReminder } = useApp();
    const controls = useAnimation();
    const ref = useRef(null);
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => { /* ... tilt logic ... */ };
    const handleMouseLeave = () => { /* ... tilt logic ... */ };

    return (
        <motion.div
            ref={ref} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
            animate={controls} style={{ transformStyle: 'preserve-3d', perspective: 800 }}
        >
            <GlassCard className="p-4">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="font-bold text-lg text-white">{client.name}</p>
                        <p className="text-sm text-gray-400 mt-1">{client.phone}</p>
                    </div>
                    <div className="flex items-center gap-2">
                         <p className="text-xs bg-white/10 text-white px-2 py-1 rounded-full">{client.requestType === 'buy' ? 'خرید' : 'اجاره/رهن'}</p>
                         <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setClientForReminder(client);
                                setActiveModal('add-reminder');
                            }}
                            className="text-gray-400 hover:text-white transition-colors p-1"
                            title="ثبت یادآوری"
                        >
                            <Bell size={18} />
                        </button>
                    </div>
                </div>
                <div className="border-t border-white/10 my-3"></div>
                <p className="text-sm text-gray-300">بودجه: از {client.budgetFrom.toLocaleString('fa-IR')} تا {client.budgetTo.toLocaleString('fa-IR')} تومان</p>
                <p className="text-sm text-gray-300 mt-1">منطقه: {client.location}</p>
            </GlassCard>
        </motion.div>
    );
};

const ClientsPage = () => {
    const { clients } = useApp();
    return (
        <div className="p-4">
            <h2 className="text-3xl font-bold text-white mb-6">لیست مشتریان</h2>
            {clients.length === 0 ? (
                 <p className="text-center text-gray-400">هنوز مشتری ثبت نشده است.</p>
            ) : (
                <div className="space-y-4">
                    {clients.map(client => <ClientCard key={client.id} client={client} />)}
                </div>
            )}
        </div>
    );
};

const RemindersPage: FC = () => {
    const { reminders, deleteReminder, setCurrentPage } = useApp();
    
    const handleDelete = (id: string) => {
        if(window.confirm('آیا از حذف این یادآوری اطمینان دارید؟')) {
            deleteReminder(id);
        }
    };

    return (
        <div className="p-4 text-white">
            <div className="flex items-center mb-6">
                {/* FIX: Corrected component name from ChevronRightIcon to ChevronRight as it was not defined. */}
                <button onClick={() => setCurrentPage('settings')} className="p-2 -mr-2 text-gray-300 hover:text-white">
                    <ChevronRight />
                </button>
                <h2 className="text-3xl font-bold">یادآوری‌ها</h2>
            </div>

            {reminders.length === 0 ? (
                <GlassCard className="p-6 text-center text-gray-400">
                    <p>هیچ یادآوری فعالی وجود ندارد.</p>
                </GlassCard>
            ) : (
                <div className="space-y-4">
                    {reminders.map(reminder => (
                        <GlassCard key={reminder.id} className="p-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-bold text-lg text-white">{reminder.clientName}</p>
                                    <p className="text-sm text-yellow-400 flex items-center mt-1">
                                        <Calendar size={14} className="ml-2" />
                                        {toPersianDate(reminder.reminderDate)}
                                    </p>
                                </div>
                                <button onClick={() => handleDelete(reminder.id)} className="text-red-400 hover:text-red-300 transition-colors p-1">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                            <p className="text-gray-200 mt-3 pt-3 border-t border-white/10">{reminder.notes}</p>
                        </GlassCard>
                    ))}
                </div>
            )}
        </div>
    );
};


const CommissionCard: FC<{ commission: Commission }> = ({ commission }) => {
    const { deleteCommission } = useApp();

    const handleDelete = () => {
        if (window.confirm('آیا از حذف این رکورد کمیسیون اطمینان دارید؟')) {
            deleteCommission(commission.id);
        }
    };

    return (
        <GlassCard className="p-4 text-sm">
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-bold text-lg text-white">{commission.buyerName} <span className="text-gray-400 mx-1">&harr;</span> {commission.sellerName}</p>
                    <p className="text-xs text-gray-400 mt-1">{toPersianDate(commission.contractDate)}</p>
                </div>
                <button onClick={handleDelete} className="text-red-400 hover:text-red-300 transition-colors p-1 flex-shrink-0">
                    <Trash2 size={18} />
                </button>
            </div>
            <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
                <div>
                    <p className="text-gray-400 text-xs">کمیسیون کل</p>
                    <p className="text-white font-semibold">{commission.totalCommission.toLocaleString('fa-IR')} تومان</p>
                </div>
                <div>
                    <p className="text-gray-400 text-xs">سهم مشاور</p>
                    <p className="text-green-400 font-bold">{commission.consultantShare.toLocaleString('fa-IR')} تومان</p>
                </div>
            </div>
        </GlassCard>
    );
};

const CommissionPage: FC = () => {
    const { commissions } = useApp();
    const [propertyPrice, setPropertyPrice] = useState<number | ''>('');
    const [calculatedCommission, setCalculatedCommission] = useState<number | null>(null);

    const handleCalculate = () => {
        // FIX: `propertyPrice` can be a string ('') or a number.
        // It must be converted to a number before performing arithmetic operations
        // to prevent TypeScript errors.
        if (Number(propertyPrice) > 0) {
            const commission = (Number(propertyPrice) * 0.01) * 1.09;
            setCalculatedCommission(commission);
        } else {
            setCalculatedCommission(null);
        }
    };

    const currentMonthIncome = commissions
        .filter(c => {
            const contractDate = new Date(c.contractDate);
            const now = new Date();
            return contractDate.getMonth() === now.getMonth() && contractDate.getFullYear() === now.getFullYear();
        })
        .reduce((sum, c) => sum + c.consultantShare, 0);

    return (
        <div className="p-4 space-y-6">
            <h2 className="text-3xl font-bold text-white">کمیسیون‌ها</h2>

            <GlassCard className="p-4 text-center">
                <p className="text-gray-300">درآمد شما در این ماه</p>
                <p className="text-3xl font-bold text-green-400 my-2">{currentMonthIncome.toLocaleString('fa-IR')} <span className="text-lg">تومان</span></p>
            </GlassCard>

            <GlassCard className="p-4">
                <h3 className="text-lg font-bold mb-3 flex items-center"><Calculator size={20} className="ml-2" /> ماشین حساب کمیسیون</h3>
                <FormInput 
                    label="قیمت کل ملک (تومان)" 
                    type="number" 
                    value={propertyPrice}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPropertyPrice(Number(e.target.value))}
                    placeholder="مثال: 5000000000"
                />
                <motion.button 
                    onClick={handleCalculate}
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    className="w-full bg-white/10 text-white font-bold py-2 px-4 rounded-lg hover:bg-white/20 transition"
                >
                    محاسبه (۱٪ + ۹٪ ارزش افزوده)
                </motion.button>
                {calculatedCommission !== null && (
                    <div className="mt-4 text-center bg-gray-900/50 p-3 rounded-lg">
                        <p className="text-gray-300">کمیسیون محاسبه شده:</p>
                        <p className="text-xl font-bold text-white">{calculatedCommission.toLocaleString('fa-IR', { maximumFractionDigits: 0 })} تومان</p>
                    </div>
                )}
            </GlassCard>

            <div>
                <h3 className="text-xl font-bold text-white mb-4">سوابق ثبت شده</h3>
                {commissions.length === 0 ? (
                    <p className="text-center text-gray-400">هنوز کمیسیونی ثبت نشده است.</p>
                ) : (
                    <div className="space-y-4">
                        {commissions.map(c => <CommissionCard key={c.id} commission={c} />)}
                    </div>
                )}
            </div>
        </div>
    );
};


const SettingsToggle: FC<{label: string; enabled: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void}> = ({ label, enabled, onChange }) => (
    <div className="flex items-center justify-between py-4 border-b border-white/10">
        <label htmlFor={label} className="text-white text-lg">{label}</label>
        <div className="relative inline-block w-14 mr-2 align-middle select-none transition duration-200 ease-in">
            <input type="checkbox" name={label} id={label} checked={enabled} onChange={onChange} className="toggle-checkbox absolute block w-7 h-7 rounded-full bg-white border-4 appearance-none cursor-pointer"/>
            <label htmlFor={label} className="toggle-label block overflow-hidden h-7 rounded-full bg-gray-600 cursor-pointer"></label>
        </div>
        <style>{`.toggle-checkbox:checked { right: 0; border-color: #4F46E5; } .toggle-checkbox:checked + .toggle-label { background-color: #4F46E5; }`}</style>
    </div>
);

const PermissionRow: FC<{
    icon: ReactNode;
    label: string;
    description: string;
    status: PermissionState | NotificationPermission;
    onRequest: () => void;
}> = ({ icon, label, description, status, onRequest }) => {
    
    const getButton = () => {
        switch (status) {
            case 'granted':
                return <div className="flex items-center text-xs text-green-400 px-2 py-1 rounded-md bg-green-500/10"><Check size={16} className="ml-1" /> فعال</div>;
            case 'denied':
                return <div className="flex items-center text-xs text-red-400 px-2 py-1 rounded-md bg-red-500/10"><X size={16} className="ml-1" /> مسدود شده</div>;
            case 'prompt':
            case 'default':
            default:
                return (
                    <button 
                        onClick={onRequest} 
                        className="text-xs bg-blue-500/20 text-blue-300 px-3 py-1.5 rounded-md hover:bg-blue-500/40 transition-colors"
                    >
                        درخواست دسترسی
                    </button>
                );
        }
    };

    return (
        <div className="flex items-center justify-between py-3">
            <div className="flex items-center">
                <div className="p-2 bg-white/5 rounded-full mr-3 text-gray-300">{icon}</div>
                <div>
                    <p className="text-white font-medium">{label}</p>
                    <p className="text-xs text-gray-400">{description}</p>
                </div>
            </div>
            <div className="flex-shrink-0">
                {getButton()}
            </div>
        </div>
    );
};

const SettingsPage = () => {
    const { settings, updateSetting, setActiveModal, setCurrentPage, permissionStatuses, requestMicrophonePermission, requestNotificationPermission } = useApp();
    
    return (
        <div className="p-4 text-white">
            <h2 className="text-3xl font-bold mb-6">تنظیمات</h2>
            <GlassCard className="p-4">
                <div className="space-y-2">
                    <motion.button 
                        onClick={() => setCurrentPage('reminders')} 
                        whileHover={{ x: -4 }}
                        className="w-full flex justify-between items-center text-right py-3 border-b border-white/10"
                    >
                         <span className="text-white text-lg">یادآوری‌ها</span>
                         <ChevronLeftIcon />
                    </motion.button>
                     <SettingsToggle label="اهداف انگیزشی (الکسا)" enabled={settings.goalsEnabled} onChange={(e) => updateSetting('goalsEnabled', e.target.checked)} />
                        <AnimatePresence>
                        {settings.goalsEnabled && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pb-2">
                                <p className="text-sm text-gray-400 mt-2">دستیار هوشمند بر اساس اهداف شما، پیام‌های روزانه ارسال می‌کند.</p>
                                <motion.button onClick={() => setActiveModal('set-goals')} whileHover={{scale: 1.05}} className="mt-3 w-full text-center py-2 px-4 bg-white/10 rounded-lg">
                                    ثبت و ویرایش اهداف
                                </motion.button>
                            </motion.div>
                        )}
                        </AnimatePresence>
                     <SettingsToggle label="شکرگزاری روزانه (الکسا)" enabled={settings.gratitudeEnabled} onChange={(e) => updateSetting('gratitudeEnabled', e.target.checked)} />
                         {settings.gratitudeEnabled && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="pb-2">
                                <p className="text-sm text-gray-400 mt-2">هر روز پیام‌های جدیدی برای شکرگزاری و مثبت‌اندیشی دریافت کنید.</p>
                            </motion.div>
                         )}
                </div>
            </GlassCard>
            
            <GlassCard className="p-4 mt-6">
                <h3 className="text-lg font-bold mb-2">دسترسی‌ها</h3>
                <div className="divide-y divide-white/10">
                    <PermissionRow
                        icon={<Mic size={20}/>}
                        label="میکروفون"
                        description="برای استفاده از دستیار صوتی الکسا"
                        status={permissionStatuses.microphone}
                        onRequest={requestMicrophonePermission}
                    />
                    <PermissionRow
                        icon={<Bell size={20}/>}
                        label="اعلان‌ها"
                        description="دریافت پیام‌های روزانه و یادآوری‌ها"
                        status={permissionStatuses.notifications}
                        onRequest={requestNotificationPermission}
                    />
                </div>
                {permissionStatuses.microphone === 'denied' && (
                     <p className="text-xs text-amber-400 mt-3 text-center p-2 bg-amber-500/10 rounded-md">
                        برای فعال‌سازی مجدد دسترسی میکروفون، باید از تنظیمات مرورگر خود اقدام کنید.
                    </p>
                )}
            </GlassCard>

        </div>
    );
};


const SearchModal = () => {
    const { listings, clients, setSelectedListing, setActiveModal } = useApp();
    
    type SearchType = 'all' | 'residential' | 'commercial' | 'client';
    const [searchType, setSearchType] = useState<SearchType>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [priceFrom, setPriceFrom] = useState('');
    const [priceTo, setPriceTo] = useState('');
    const [areaFrom, setAreaFrom] = useState('');
    const [areaTo, setAreaTo] = useState('');
    
    const [results, setResults] = useState<(Listing | Client)[]>([]);
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setHasSearched(true);
        
        let filteredListings = listings;
        let filteredClients = clients;

        // Filter by type
        if (searchType === 'residential') {
            filteredListings = listings.filter(l => l.type === 'residential');
            filteredClients = [];
        } else if (searchType === 'commercial') {
            filteredListings = listings.filter(l => l.type === 'commercial');
            filteredClients = [];
        } else if (searchType === 'client') {
            filteredListings = [];
        }

        const lowerSearchTerm = searchTerm.toLowerCase();

        // Simple text search
        if (lowerSearchTerm) {
            filteredListings = filteredListings.filter(l => 
                l.address.toLowerCase().includes(lowerSearchTerm) ||
                l.ownerName.toLowerCase().includes(lowerSearchTerm) ||
                l.description.toLowerCase().includes(lowerSearchTerm)
            );
            filteredClients = filteredClients.filter(c =>
                c.name.toLowerCase().includes(lowerSearchTerm) ||
                c.phone.includes(lowerSearchTerm) ||
                c.location.toLowerCase().includes(lowerSearchTerm) ||
                c.description.toLowerCase().includes(lowerSearchTerm)
            );
        }

        // Advanced filters (only for listings)
        const numPriceFrom = Number(priceFrom);
        const numPriceTo = Number(priceTo);
        const numAreaFrom = Number(areaFrom);
        const numAreaTo = Number(areaTo);

        filteredListings = filteredListings.filter(l => {
            const price = l.totalPrice || l.deposit || 0;
            const area = l.area;

            if (numPriceFrom && price < numPriceFrom) return false;
            if (numPriceTo && price > numPriceTo) return false;
            if (numAreaFrom && area < numAreaFrom) return false;
            if (numAreaTo && area > numAreaTo) return false;
            
            return true;
        });
        
        setResults([...filteredListings, ...filteredClients]);
    };
    
    const SearchTab: FC<{ value: SearchType, current: SearchType, onClick: (v: SearchType) => void, children: ReactNode }> = ({ value, current, onClick, children }) => (
        <button
            onClick={() => onClick(value)}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${current === value ? 'text-white' : 'text-gray-400 hover:text-white'}`}
        >
            {children}
            {current === value && <motion.div layoutId="search-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
        </button>
    );

    return (
        <div className="p-4 flex flex-col h-full">
            <h3 className="text-xl font-bold mb-4 text-white">جستجوی پیشرفته</h3>
            
            <form onSubmit={handleSearch}>
                <div className="flex justify-around mb-4 border-b border-white/10">
                    <SearchTab value="all" current={searchType} onClick={setSearchType}>همه</SearchTab>
                    <SearchTab value="residential" current={searchType} onClick={setSearchType}>مسکونی</SearchTab>
                    <SearchTab value="commercial" current={searchType} onClick={setSearchType}>تجاری</SearchTab>
                    <SearchTab value="client" current={searchType} onClick={setSearchType}>مشتری</SearchTab>
                </div>

                <FormInput label="جستجوی ساده" placeholder="آدرس، نام، توضیحات..." value={searchTerm} onChange={(e: any) => setSearchTerm(e.target.value)} />
                
                <AnimatePresence>
                {searchType !== 'client' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <h4 className="text-md font-semibold text-gray-300 mb-2 mt-4 border-t border-white/10 pt-4">فیلترهای پیشرفته</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                             <FormInput label="قیمت از (تومان)" type="number" value={priceFrom} onChange={(e: any) => setPriceFrom(e.target.value)} />
                             <FormInput label="قیمت تا (تومان)" type="number" value={priceTo} onChange={(e: any) => setPriceTo(e.target.value)} />
                        </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                             <FormInput label="متراژ از (متر)" type="number" value={areaFrom} onChange={(e: any) => setAreaFrom(e.target.value)} />
                             <FormInput label="متراژ تا (متر)" type="number" value={areaTo} onChange={(e: any) => setAreaTo(e.target.value)} />
                        </div>
                    </motion.div>
                )}
                </AnimatePresence>

                 <motion.button type="submit" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-full mt-4 bg-white/20 text-white font-bold py-3 px-4 rounded-lg hover:bg-white/30 transition">
                    جستجو
                </motion.button>
            </form>
            
            <div className="border-t border-white/10 my-6"></div>

            <div className="flex-1 overflow-y-auto -mx-4 px-4">
                {hasSearched ? (
                    results.length > 0 ? (
                        <div className="space-y-4">
                            {results.map(item => {
                                if ('address' in item) { // Type guard for Listing
                                    return <ListingCard key={item.id} listing={item} onClick={() => setActiveModal(null)} />;
                                } else { // It's a Client
                                    return <ClientCard key={item.id} client={item} />;
                                }
                            })}
                        </div>
                    ) : (
                        <p className="text-center text-gray-400 py-8">نتیجه‌ای یافت نشد.</p>
                    )
                ) : (
                    <p className="text-center text-gray-400 py-8">برای دیدن نتایج، جستجو کنید.</p>
                )}
            </div>
        </div>
    )
}

const GeminiChatWindow: FC<{ onClose: () => void }> = ({ onClose }) => {
    const { setVoiceSessionActive, permissionState } = useApp();
    type Message = {
        text: string;
        sender: 'user' | 'bot';
        sources?: { uri: string; title: string }[];
        isLoading?: boolean;
    };
    const [messages, setMessages] = useState<Message[]>([
        { text: "سلام امیر عزیز! من الکسا هستم. چطور می‌توانم امروز به شما کمک کنم؟", sender: 'bot' }
    ]);
    const [input, setInput] = useState('');
    const [isThinkingMode, setThinkingMode] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSend = async () => {
        const trimmedInput = input.trim();
        if (trimmedInput === '') return;

        const userMessage: Message = { text: trimmedInput, sender: 'user' };
        setMessages(prev => [...prev, userMessage, { text: "", sender: 'bot', isLoading: true }]);
        setInput('');

        try {
            const modelName = isThinkingMode ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
            const modelConfig = isThinkingMode
                ? {
                    thinkingConfig: { thinkingBudget: 32768 },
                    tools: [{ googleSearch: {} }],
                  }
                : {
                    tools: [{ googleSearch: {} }],
                  };

            const response = await ai.models.generateContent({
                model: modelName,
                contents: trimmedInput,
                config: {
                    ...modelConfig,
                    systemInstruction: `شما "الکسا"، یک دستیار هوش مصنوعی بسیار پیشرفته، صمیمی و حرفه‌ای برای یک مشاور املاک به نام "امیر" هستید. لحن شما همیشه دوستانه، محترمانه و بسیار طبیعی است. پاسخ‌هایتان کوتاه، دقیق و محاوره‌ای هستند. همیشه امیر را با نامش خطاب کنید.`
                },
            });
            
            const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            const sources = groundingChunks
                .map(chunk => chunk.web)
                .filter(web => web?.uri && web.title) as { uri: string; title: string }[];
            
            const botMessage: Message = { text: response.text, sender: 'bot', sources: sources.length > 0 ? sources : undefined };

            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = botMessage;
                return newMessages;
            });

        } catch (error) {
            console.error("Gemini API call failed in chat:", error);
            const errorMessage: Message = { text: "متاسفانه در حال حاضر امکان پاسخگویی وجود ندارد. لطفا بعدا تلاش کنید.", sender: 'bot' };
            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = errorMessage;
                return newMessages;
            });
        }
    };

    const handleVoiceClick = () => {
        setVoiceSessionActive(true);
        onClose();
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 right-4 z-40 w-full max-w-sm"
        >
            <GlassCard className="h-[60vh] flex flex-col p-0 overflow-hidden">
                <header className="flex items-center justify-between p-3 border-b border-white/10 flex-shrink-0">
                    <div className="flex items-center">
                         <SiriSvgIcon size={24} className="mr-2"/>
                         <h3 className="font-bold text-white">دستیار هوشمند</h3>
                    </div>
                     <div className="flex items-center gap-2">
                        <motion.button 
                            onClick={() => setThinkingMode(!isThinkingMode)} 
                            className={`p-1 rounded-full transition-colors ${isThinkingMode ? 'text-purple-400 bg-purple-900/50' : 'text-gray-400 hover:text-white'}`}
                            title="حالت تفکر عمیق"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            animate={{ rotate: isThinkingMode ? 360 : 0 }}
                        >
                            <Sparkles size={18} />
                        </motion.button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
                    </div>
                </header>
                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                     {messages.map((msg, i) => (
                        <div key={i}>
                            <div className={`flex items-end gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.sender === 'bot' && <Bot size={20} className="text-purple-400 flex-shrink-0 mb-1" />}
                                {msg.isLoading ? (
                                    <div className="flex items-center space-x-1 rtl:space-x-reverse bg-gray-700 rounded-bl-lg rounded-2xl px-3 py-2">
                                        <motion.div className="w-2 h-2 bg-white/50 rounded-full" animate={{ scale: [1, 1.2, 1], transition: { duration: 0.8, repeat: Infinity } }}/>
                                        <motion.div className="w-2 h-2 bg-white/50 rounded-full" animate={{ scale: [1, 1.2, 1], transition: { duration: 0.8, repeat: Infinity, delay: 0.2 } }}/>
                                        <motion.div className="w-2 h-2 bg-white/50 rounded-full" animate={{ scale: [1, 1.2, 1], transition: { duration: 0.8, repeat: Infinity, delay: 0.4 } }}/>
                                    </div>
                                ) : (
                                    <p className={`max-w-xs text-sm px-3 py-2 rounded-2xl ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-lg' : 'bg-gray-700 text-white rounded-bl-lg'}`}>{msg.text}</p>
                                )}
                                {msg.sender === 'bot' && !msg.isLoading && (
                                    <button onClick={() => speakText(msg.text)} className="text-gray-400 hover:text-white transition-colors"><Volume2 size={18}/></button>
                                )}
                            </div>
                             {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-2 mr-8 text-xs">
                                    <p className="font-bold text-gray-400 mb-1">منابع:</p>
                                    <div className="flex flex-col items-start gap-1">
                                        {msg.sources.map((source, idx) => (
                                            <a href={source.uri} target="_blank" rel="noopener noreferrer" key={idx} className="text-blue-400 hover:underline truncate max-w-xs">
                                                {idx + 1}. {source.title}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                 <div className="p-3 border-t border-white/10 flex-shrink-0">
                    <div className="flex items-center bg-gray-900/50 rounded-full border border-gray-700">
                        <input value={input} onChange={e => setInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} type="text" placeholder="پیام خود را بنویسید..." className="flex-1 bg-transparent px-4 py-2 text-white placeholder-gray-500 focus:outline-none" />
                        {permissionState === 'granted' && (
                            <button onClick={handleVoiceClick} className="p-2 text-white hover:text-gray-300">
                                <LiveAiIcon size={24} />
                            </button>
                        )}
                        <button onClick={handleSend} className="p-2 text-white hover:text-gray-300"><Send /></button>
                    </div>
                </div>
            </GlassCard>
        </motion.div>
    )
}

const ImageViewer: FC<{ images: string[]; initialIndex: number; onClose: () => void }> = ({ images, initialIndex, onClose }) => {
    const [[page, direction], setPage] = useState([initialIndex, 0]);
    const [isDownloadMenuOpen, setDownloadMenuOpen] = useState(false);

    const imageIndex = wrap(0, images.length, page);
    const currentImageUrl = images[imageIndex];

    const paginate = (newDirection: number) => {
        setPage([page + newDirection, newDirection]);
    };
    
    const handleDownload = (imageUrl: string, index: number) => {
        fetch(imageUrl)
            .then(res => res.blob())
            .then(blob => {
                const objectUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = objectUrl;
                link.download = `tehranak-image-${index + 1}.jpg`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(objectUrl);
            });
    };

    const handleBulkDownload = () => {
        images.forEach((url, idx) => {
            handleDownload(url, idx);
        });
        setDownloadMenuOpen(false);
    };

    return (
        <motion.div
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <div className="absolute inset-0 -z-10" onClick={onClose}></div>
            
            <div className="relative w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                <AnimatePresence initial={false} custom={direction}>
                    <motion.img
                        key={page}
                        src={currentImageUrl}
                        className="absolute max-w-[90vw] max-h-[90vh] object-contain"
                        custom={direction}
                        variants={sliderVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ x: { type: 'spring', stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={1}
                        onDragEnd={(e, { offset, velocity }) => {
                            const swipe = swipePower(offset.x, velocity.x);
                            if (swipe < -swipeConfidenceThreshold) paginate(1);
                            else if (swipe > swipeConfidenceThreshold) paginate(-1);
                        }}
                    />
                </AnimatePresence>
            </div>

            <div className="absolute inset-0 pointer-events-none">
                <button onClick={onClose} className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded-full pointer-events-auto">
                    <X />
                </button>

                <div className="absolute top-4 left-4 pointer-events-auto">
                    <motion.button onClick={() => setDownloadMenuOpen(!isDownloadMenuOpen)} className="text-white bg-black/50 p-2 rounded-full">
                        <Download />
                    </motion.button>
                    <AnimatePresence>
                    {isDownloadMenuOpen && (
                        <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute top-full mt-2 w-48 bg-gray-800/80 backdrop-blur-md rounded-lg shadow-lg z-10"
                        >
                            <button onClick={() => { handleDownload(currentImageUrl, imageIndex); setDownloadMenuOpen(false); }} className="w-full text-right px-4 py-2 text-white hover:bg-white/10 transition-colors">دانلود عکس فعلی</button>
                            <button onClick={handleBulkDownload} className="w-full text-right px-4 py-2 text-white hover:bg-white/10 transition-colors">دانلود همه عکس‌ها</button>
                        </motion.div>
                    )}
                    </AnimatePresence>
                </div>

                {images.length > 1 && (
                    <>
                        <button onClick={() => paginate(-1)} className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 p-2 rounded-full text-white hover:bg-black/75 transition pointer-events-auto"><ChevronLeft /></button>
                        <button onClick={() => paginate(1)} className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 p-2 rounded-full text-white hover:bg-black/75 transition pointer-events-auto"><ChevronRight /></button>
                    </>
                )}
            </div>
        </motion.div>
    );
};

const ListingImageSlider: FC<{ listing: Listing }> = ({ listing }) => {
    const { images } = listing;
    const [[page, direction], setPage] = useState([0, 0]);
    const [isViewerOpen, setViewerOpen] = useState(false);
    
    if (!images || images.length === 0) {
        return <div className="w-full h-56 bg-gray-800/50 flex items-center justify-center text-gray-400 md:rounded-t-2xl">بدون عکس</div>;
    }

    const imageIndex = wrap(0, images.length, page);

    const paginate = (newDirection: number) => {
        setPage([page + newDirection, newDirection]);
    };

    return (
        <div className="relative w-full h-56 md:h-64 flex items-center justify-center overflow-hidden md:rounded-t-2xl bg-black">
            <AnimatePresence>
                {isViewerOpen && <ImageViewer images={images} initialIndex={imageIndex} onClose={() => setViewerOpen(false)} />}
            </AnimatePresence>
            <AnimatePresence initial={false} custom={direction}>
                <motion.img
                    key={page}
                    src={images[imageIndex]}
                    className="absolute w-full h-full object-cover"
                    custom={direction}
                    variants={sliderVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ x: { type: 'spring', stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={1}
                    onDragEnd={(e, { offset, velocity }) => {
                        const swipe = swipePower(offset.x, velocity.x);
                        if (swipe < -swipeConfidenceThreshold) paginate(1);
                        else if (swipe > swipeConfidenceThreshold) paginate(-1);
                    }}
                />
            </AnimatePresence>
            <div className="absolute top-2 right-2 z-10 flex space-x-2">
                <button onClick={() => setViewerOpen(true)} className="bg-black/50 p-2 rounded-full text-white hover:bg-black/75 transition"><Maximize size={18} /></button>
            </div>
            {images.length > 1 && (
                <>
                    <button onClick={() => paginate(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/50 p-2 rounded-full text-white hover:bg-black/75 transition"><ChevronLeft /></button>
                    <button onClick={() => paginate(1)} className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/50 p-2 rounded-full text-white hover:bg-black/75 transition"><ChevronRight /></button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex space-x-2 rtl:space-x-reverse z-10">
                        {images.map((_, i) => (
                            <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === imageIndex ? 'bg-white' : 'bg-white/50'}`} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};


const ListingDetailModal = () => {
    const { selectedListing, setSelectedListing, deleteListing, addNotification, setActiveModal, setListingToEdit } = useApp();
    if (!selectedListing) return null;
    
    const handleCopy = () => {
        const details = `
            آدرس: ${selectedListing.address}
            متراژ: ${selectedListing.area} متر
            ${selectedListing.bedrooms ? `خواب: ${selectedListing.bedrooms}` : ''}
            قیمت: ${selectedListing.totalPrice ? `${selectedListing.totalPrice.toLocaleString('fa-IR')} تومان` : `ودیعه ${selectedListing.deposit?.toLocaleString('fa-IR')} / اجاره ${selectedListing.monthlyRent?.toLocaleString('fa-IR')}`}
            مالک: ${selectedListing.ownerName} | تماس: ${selectedListing.ownerPhone}
        `.trim().replace(/\s\s+/g, '\n');
        navigator.clipboard.writeText(details);
        addNotification('اطلاعات ملک در کلیپ‌بورد ذخیره شد.');
    };

    const handleDelete = () => {
        if (window.confirm(`آیا از حذف آگهی "${selectedListing.address}" اطمینان دارید؟ این عمل قابل بازگشت نیست.`)) {
            deleteListing(selectedListing.id);
            setSelectedListing(null);
            addNotification('آگهی با موفقیت حذف گردید.');
        }
    };

    const handleEdit = () => {
        setListingToEdit(selectedListing);
        setActiveModal(selectedListing.type === 'residential' ? 'edit-residential' : 'edit-commercial');
        setSelectedListing(null);
    };

    const InfoRow = ({ label, value }: {label: string, value: ReactNode}) => (
        value ? <div className="flex justify-between items-center py-2 border-b border-white/10"><dt className="text-gray-400">{label}</dt><dd className="text-white font-medium">{value}</dd></div> : null
    );

    return (
        <ModalContainer onClose={() => setSelectedListing(null)} fullScreen={true}>
            <div className="flex flex-col h-full">
                <ListingImageSlider listing={selectedListing} />
                <div className="flex-1 p-4 overflow-y-auto">
                    <h2 className="text-2xl font-bold text-white mb-2">{selectedListing.address}</h2>
                    <p className="text-lg font-semibold text-green-300 mb-4">
                         {selectedListing.totalPrice ? `${selectedListing.totalPrice.toLocaleString('fa-IR')} تومان` : `ودیعه ${selectedListing.deposit?.toLocaleString('fa-IR')} / اجاره ${selectedListing.monthlyRent?.toLocaleString('fa-IR')}`}
                    </p>
                    <dl className="text-sm">
                        <InfoRow label="نوع" value={selectedListing.type === 'residential' ? 'مسکونی' : 'تجاری'} />
                        <InfoRow label="متراژ" value={`${selectedListing.area} متر مربع`} />
                        <InfoRow label="تعداد خواب" value={selectedListing.bedrooms} />
                        <InfoRow label="طبقه" value={selectedListing.floor} />
                        <InfoRow label="سال ساخت" value={selectedListing.buildYear} />
                        <InfoRow label="نام مالک" value={selectedListing.ownerName} />
                        <InfoRow label="شماره مالک" value={selectedListing.ownerPhone} />
                    </dl>
                    <div className="mt-4">
                        <h3 className="text-md font-bold text-gray-300 mb-2">توضیحات</h3>
                        <p className="text-sm text-gray-200 leading-relaxed">{selectedListing.description || "توضیحاتی ثبت نشده است."}</p>
                    </div>
                </div>
                <div className="p-3 border-t border-white/10 bg-black/30 flex justify-around items-center sticky bottom-0">
                     <ActionButton icon={<Copy size={20} />} label="کپی" onClick={handleCopy} />
                     <a href={`tel:${selectedListing.ownerPhone}`} className="flex flex-col items-center space-y-1 text-gray-300 hover:text-white transition-colors"><Phone size={20} /><span className="text-xs">تماس</span></a>
                     <ActionButton icon={<Edit size={20} />} label="ویرایش" onClick={handleEdit} />
                     <ActionButton icon={<Trash2 size={20} />} label="حذف" onClick={handleDelete} className="text-red-400 hover:text-red-300" />
                </div>
            </div>
        </ModalContainer>
    );
};

const ActionButton: FC<{icon: ReactNode, label: string, onClick: () => void, className?: string}> = ({ icon, label, onClick, className }) => (
    <button onClick={onClick} className={`flex flex-col items-center space-y-1 text-gray-300 hover:text-white transition-colors ${className}`}>
        {icon}
        <span className="text-xs">{label}</span>
    </button>
);


// Main App Structure
// =================================

const NavBackgroundSVG = () => (
    <div className="absolute bottom-0 left-0 right-0 w-full h-[88px]" style={{ filter: 'drop-shadow(0 -5px 15px rgba(0,0,0,0.3))' }}>
        <svg
            width="100%"
            height="100%"
            viewBox="0 0 375 88"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
        >
            <path
                d="M0 88V25C125 25 150 25 171.5 12.5C183.5 5.5 191.5 5.5 203.5 12.5C225 25 250 25 375 25V88H0Z"
                fill="url(#nav-bg-gradient)"
                stroke="rgba(255, 255, 255, 0.15)"
                strokeWidth="1.5"
            />
            <defs>
                <linearGradient
                    id="nav-bg-gradient"
                    x1="187.5"
                    y1="0"
                    x2="187.5"
                    y2="88"
                    gradientUnits="userSpaceOnUse"
                >
                    <stop stopColor="#2C2C2E" stopOpacity="0.8" />
                    <stop offset="1" stopColor="#1C1C1E" stopOpacity="0.95" />
                </linearGradient>
            </defs>
        </svg>
    </div>
);


const MainApp = () => {
    // FIX: Destructure `setListingToEdit` from `useApp` to make it available in the component's scope.
    // This resolves the "Cannot find name 'setListingToEdit'" error that occurs in the ModalContainer's onClose handler.
    const { currentPage, setCurrentPage, activeModal, setActiveModal, selectedListing, listingToEdit, setListingToEdit, setClientForReminder, permissionState } = useApp();
    const [isChatOpen, setChatOpen] = useState(false);
    const [isAddMenuOpen, setAddMenuOpen] = useState(false);

    const pages: { [key in Page]: ReactNode } = {
        dashboard: <DashboardPage />,
        listings: <ListingsPage />,
        clients: <ClientsPage />,
        commission: <CommissionPage />,
        settings: <SettingsPage />,
        reminders: <RemindersPage />,
    };

    const navItems: { page: Page; label: string; icon: ReactNode }[] = [
        { page: 'dashboard', label: 'داشبورد', icon: <Home /> },
        { page: 'listings', label: 'آگهی‌ها', icon: <Building /> },
        { page: 'clients', label: 'مشتریان', icon: <Users /> },
        { page: 'commission', label: 'کمیسیون', icon: <Percent /> },
    ];
    
    return (
        <div className="w-full min-h-screen bg-black text-white">
            <AuroraBackground />
            {permissionState === 'granted' && activeModal !== 'search' && <DynamicIsland />}

            <main className="relative z-10 pt-24 pb-28 px-2">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentPage}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        {pages[currentPage]}
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* Floating Buttons */}
             {permissionState === 'granted' && (
                 <motion.button 
                    onClick={() => setChatOpen(true)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="fixed bottom-24 right-4 z-30"
                >
                    <SiriSvgIcon size={64}/>
                </motion.button>
             )}


            {/* Bottom Navigation */}
            <footer className="fixed bottom-0 left-0 right-0 z-20 h-[88px]">
                <div className="relative max-w-md mx-auto h-full">
                    <NavBackgroundSVG />
                    <div className="relative z-10 w-full h-full">
                        {/* Nav items container */}
                        <div className="flex justify-around items-end h-full">
                            {renderNavItem(navItems[0])}
                            {renderNavItem(navItems[1])}
                            <div className="w-24" /> {/* Spacer for central button */}
                            {renderNavItem(navItems[2])}
                            {renderNavItem(navItems[3])}
                        </div>

                        {/* Central Add Button */}
                        <div className="absolute left-1/2 top-2 -translate-x-1/2 flex items-center justify-center">
                            <motion.button
                                onClick={() => setAddMenuOpen(prev => !prev)}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg"
                                style={{ boxShadow: '0 0 20px rgba(139, 92, 246, 0.5)' }}
                                aria-label="افزودن جدید"
                            >
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={isAddMenuOpen ? 'close' : 'add'}
                                        initial={{ rotate: -90, scale: 0 }}
                                        animate={{ rotate: 0, scale: 1 }}
                                        exit={{ rotate: 90, scale: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        {isAddMenuOpen ? <X size={32} /> : <Plus size={32} />}
                                    </motion.div>
                                </AnimatePresence>
                            </motion.button>
                        </div>
                    </div>
                </div>
            </footer>
             
             {/* Modals & Menus */}
             <AnimatePresence>
                {selectedListing && <ListingDetailModal />}

                {isAddMenuOpen && (
                    <AddListingMenu
                        onClose={() => setAddMenuOpen(false)}
                        onSelect={(modal) => {
                            setActiveModal(modal);
                            setAddMenuOpen(false);
                        }}
                    />
                )}
                {activeModal && (
                    <ModalContainer 
                        onClose={() => { setActiveModal(null); setListingToEdit(null); setClientForReminder(null); }}
                        fullScreen={activeModal === 'search'}
                    >
                        {activeModal === 'add-residential' && <AddResidentialListingForm />}
                        {activeModal === 'add-commercial' && <AddCommercialListingForm />}
                        {activeModal === 'edit-residential' && <AddResidentialListingForm listingToEdit={listingToEdit!} />}
                        {/* FIX: Correct typo in prop name from `listingToToEdit` to `listingToEdit` */}
                        {activeModal === 'edit-commercial' && <AddCommercialListingForm listingToEdit={listingToEdit!} />}
                        {activeModal === 'add-client' && <AddClientForm />}
                        {activeModal === 'add-commission' && <AddCommissionForm />}
                        {activeModal === 'set-goals' && <GoalSettingModal />}
                        {activeModal === 'add-reminder' && <AddReminderForm />}
                        {activeModal === 'search' && <SearchModal />}
                    </ModalContainer>
                )}
                 {isChatOpen && <GeminiChatWindow onClose={() => setChatOpen(false)} />}
             </AnimatePresence>
        </div>
    );
    
    function renderNavItem(item: { page: Page; label: string; icon: ReactNode }) {
        const isActive = currentPage === item.page;
        return (
            <button
                key={item.page}
                onClick={() => setCurrentPage(item.page)}
                className="relative flex flex-col items-center justify-end w-20 h-full text-gray-400 transition-colors pb-3"
            >
                {isActive && (
                    <motion.div
                        layoutId="active-nav-indicator"
                        className="absolute bottom-1 h-1 w-8 bg-white rounded-full"
                    />
                )}
                <div className={`transition-transform duration-300 ${isActive ? '-translate-y-1' : ''}`}>
                    {/* FIX: Cast icon to React.ReactElement<any> to allow adding props like 'color'. */}
                    {React.cloneElement(item.icon as React.ReactElement<any>, { color: isActive ? 'white' : 'currentColor' })}
                </div>
                <span className={`text-xs mt-1 transition-opacity duration-300 ${isActive ? 'opacity-100 text-white' : 'opacity-0'}`}>{item.label}</span>
            </button>
        );
    }
};


// Live AI Service ("Alexa")
// =================================
const getAIMessage = async (prompt: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text.trim();
    } catch (error) {
        console.error("Gemini API call failed:", error);
        return "لحظه‌ای برای تأمل: هر روز فرصتی جدید برای رشد است.";
    }
};

// App Entry Point
// =================================

function App() {
    return (
        <AppProvider>
            <AppContent />
        </AppProvider>
    );
}

const AppContent = () => {
    const { 
        settings, goals, addNotification, listings, clients, reminders, 
        isVoiceSessionActive, setVoiceSessionActive, setLiveTranscript, 
        permissionState, setPermissionState, addReminder, setPermissionStatuses
    } = useApp();
    const schedulerTimeoutRef = useRef<number | null>(null);
    const inactivityTimerRef = useRef<number | null>(null);

    useEffect(() => {
        let scrollTimeout: number | null = null;
        const handleScroll = () => {
            document.body.classList.add('is-scrolling');
            if (scrollTimeout) clearTimeout(scrollTimeout);
            scrollTimeout = window.setTimeout(() => {
                document.body.classList.remove('is-scrolling');
            }, 2000);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        initDB();
    }, []);

    // Centralized Permission Checker
    // FIX: This effect was violating the Rules of Hooks by calling `useApp()` inside the effect callback and dependency array.
    // It has been refactored to use state setters (`setPermissionState`, `setPermissionStatuses`) obtained from a single, top-level `useApp()` call.
    // This resolves the "Invalid hook call" error (React error #321).
    useEffect(() => {
        let isMounted = true;
        let micPermissionStatus: PermissionStatus | null = null;

        const handleMicChange = () => {
            if (micPermissionStatus && isMounted) {
                const newMicState = micPermissionStatus.state as PermissionState;
                setPermissionState(newMicState);
                setPermissionStatuses(prev => ({ ...prev, microphone: newMicState }));
            }
        };
        
        const checkPermissions = async () => {
            let initialMicStatus: PermissionState = 'prompt';
            const initialNotifStatus = ('Notification' in window) ? Notification.permission : 'default';

            try {
                if (navigator.permissions) {
                    micPermissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
                    initialMicStatus = micPermissionStatus.state as PermissionState;
                    micPermissionStatus.onchange = handleMicChange;
                }
            } catch (error) {
                console.error("Error querying permissions:", error);
            }
            
            if(isMounted) {
                setPermissionState(initialMicStatus);
                setPermissionStatuses({ microphone: initialMicStatus, notifications: initialNotifStatus });
            }
        };

        checkPermissions();

        return () => {
            isMounted = false;
            if (micPermissionStatus) {
                micPermissionStatus.onchange = null;
            }
        };
    }, [setPermissionState, setPermissionStatuses]);
    
     useEffect(() => {
        const clearScheduler = () => {
            if (schedulerTimeoutRef.current) {
                clearTimeout(schedulerTimeoutRef.current);
                schedulerTimeoutRef.current = null;
            }
        };
    
        const sendMessage = async () => {
            const now = new Date();
            const hour = now.getHours();

            if (hour < 8 || hour >= 22) { scheduleNextMessage(); return; }

            const shouldSendMotivation = settings.goalsEnabled && goals.trim() !== '';
            const shouldSendGratitude = settings.gratitudeEnabled;
            
            let messageType: 'motivation' | 'gratitude' | null = null;
            if (shouldSendMotivation && shouldSendGratitude) messageType = Math.random() > 0.5 ? 'motivation' : 'gratitude';
            else if (shouldSendMotivation) messageType = 'motivation';
            else if (shouldSendGratitude) messageType = 'gratitude';
            if (!messageType) { scheduleNextMessage(); return; }
            
            let prompt = '';
            const summary = `کاربر ${listings.length} آگهی و ${clients.length} مشتری فعال دارد. نام او امیر است.`;
            if (messageType === 'motivation') prompt = `شما یک دستیار هوش مصنوعی به نام الکسا هستید. برای یک مشاور املاک یک پیام انگیزشی کوتاه (کمتر از ۲۰ کلمه) و الهام‌بخش به زبان فارسی بنویسید که او را امیر خطاب کند. این پیام باید کاملا جدید باشد. ${summary} هدف اصلی کاربر این است: "${goals}"`;
            else prompt = `شما یک دستیار هوش مصنوعی به نام الکسا هستید. برای یک مشاور املاک به نام امیر یک پیام شکرگزاری کوتاه (کمتر از ۲۰ کلمه)، عمیق و کاملا جدید به زبان فارسی بنویسید تا روز او را بهتر کند. ${summary}`;

            const message = await getAIMessage(prompt);
            if (message) {
                addNotification(message);
                if (Notification.permission === 'granted') new Notification('پیام روزانه از الکسا', { body: message, icon: '/favicon.svg', badge: '/favicon.svg' });
            }
            scheduleNextMessage();
        };

        const scheduleNextMessage = () => {
            clearScheduler(); 
            const now = new Date();
            const hour = now.getHours();
            let nextMessageTime: Date;

            if (hour >= 22) { nextMessageTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0, 0); } 
            else if (hour < 8) { nextMessageTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0); } 
            else {
                const randomDelay = 2700000 + Math.random() * (7200000 - 2700000);
                nextMessageTime = new Date(now.getTime() + randomDelay);
                if (nextMessageTime.getHours() >= 22) nextMessageTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0, 0);
            }
            const delay = nextMessageTime.getTime() - now.getTime();
            schedulerTimeoutRef.current = window.setTimeout(sendMessage, delay);
        };

        if ((settings.goalsEnabled || settings.gratitudeEnabled) && Notification.permission === 'granted') scheduleNextMessage();
        else clearScheduler();
        return clearScheduler;
    }, [settings, goals, listings, clients, addNotification]);

     // Reminder Notifications Effect
    useEffect(() => {
        if (!reminders.length || Notification.permission !== 'granted') return;

        const checkReminders = () => {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            reminders.forEach(reminder => {
                const reminderDate = new Date(reminder.reminderDate);
                const reminderDay = new Date(reminderDate.getFullYear(), reminderDate.getMonth(), reminderDate.getDate());
                const dayBefore = new Date(reminderDay);
                dayBefore.setDate(dayBefore.getDate() - 1);
                const dayBeforeKey = `notif-sent-daybefore-${reminder.id}`;
                if (dayBefore.getTime() === today.getTime() && now.getHours() >= 9 && !localStorage.getItem(dayBeforeKey)) {
                     new Notification(`یادآوری برای فردا: ${reminder.clientName}`, { body: reminder.notes, icon: '/favicon.svg' });
                    localStorage.setItem(dayBeforeKey, 'true');
                }
                const onDayKey = `notif-sent-onday-${reminder.id}`;
                if (reminderDay.getTime() === today.getTime() && now.getHours() >= 9 && !localStorage.getItem(onDayKey)) {
                    new Notification(`یادآوری امروز: ${reminder.clientName}`, { body: reminder.notes, icon: '/favicon.svg' });
                    localStorage.setItem(onDayKey, 'true');
                }
            });
        };
        const intervalId = setInterval(checkReminders, 60 * 60 * 1000);
        checkReminders();
        return () => clearInterval(intervalId);
    }, [reminders]);

    // Live Voice Session Manager
    useEffect(() => {
        if (!isVoiceSessionActive) return;

        let sessionPromise: Promise<any> | null = null;
        let audioStream: MediaStream | null = null;
        let inputAudioContext: AudioContext | null = null;
        let scriptProcessor: ScriptProcessorNode | null = null;
        const sources = new Set<AudioBufferSourceNode>();
        let nextStartTime = 0;
        let userTranscript = '';
        let modelTranscript = '';

        const resetInactivityTimer = () => {
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = window.setTimeout(() => setVoiceSessionActive(false), 8000);
        };

        const setup = async () => {
            try {
                 const searchListingsFn: FunctionDeclaration = {
                    name: 'searchListings',
                    parameters: {
                        type: Type.OBJECT,
                        description: 'جستجو در بین آگهی‌های ثبت شده. می‌تواند بر اساس آدرس، منطقه، محدوده قیمت یا محدوده متراژ فیلتر کند.',
                        properties: {
                            query: { type: Type.STRING, description: 'بخشی از آدرس، نام مالک یا منطقه' },
                            minPrice: { type: Type.NUMBER, description: 'حداقل قیمت' },
                            maxPrice: { type: Type.NUMBER, description: 'حداکثر قیمت' },
                            minArea: { type: Type.NUMBER, description: 'حداقل متراژ' },
                            maxArea: { type: Type.NUMBER, description: 'حداکثر متراژ' },
                        },
                    },
                };
                const getClientDetailsFn: FunctionDeclaration = {
                    name: 'getClientDetails',
                    parameters: {
                        type: Type.OBJECT,
                        description: 'پیدا کردن اطلاعات یک مشتری خاص با استفاده از نام او.',
                        properties: { name: { type: Type.STRING, description: 'نام کامل مشتری' } },
                        required: ['name'],
                    },
                };

                audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                const outputNode = liveOutputAudioContext.createGain();
                outputNode.connect(liveOutputAudioContext.destination);
                const dataContext = JSON.stringify({
                    listings: listings.slice(0, 10).map(({ id, address, type, area, totalPrice, monthlyRent }) => ({ id, address, type, area, totalPrice, monthlyRent })),
                    clients: clients.slice(0, 10).map(({ id, name, requestType, budgetFrom, budgetTo }) => ({ id, name, requestType, budgetFrom, budgetTo })),
                });
                const systemInstruction = `شما "الکسا"، یک دستیار هوش مصنوعی صوتی بسیار پیشرفته، صمیمی و حرفه‌ای برای یک مشاور املاک به نام "امیر" هستید.
                
                **شخصیت شما:**
                - شما یک نابغه با قابلیت یادگیری سریع هستید. از هر مکالمه برای بهبود پاسخ‌های خود استفاده می‌کنید.
                - لحن شما همیشه دوستانه، محترمانه و بسیار طبیعی است.
                - پاسخ‌هایتان کوتاه، دقیق و محاوره‌ای هستند، انگار که یک انسان واقعی صحبت می‌کند.

                **قابلیت‌های شما:**
                1.  **جستجوی هوشمند در CRM:** شما می‌توانید درخواست‌های گفتاری و طبیعی امیر برای جستجوی آگهی‌ها و مشتریان را درک کنید. به عنوان مثال: "آپارتمان‌های فروش در نیاوران رو برام پیدا کن" یا "اطلاعات مشتری، آقای رضایی رو بهم بده".
                2.  **خلاصه‌سازی نتایج:** پس از اجرای جستجو از طریق ابزارها (functions)، شما **نباید** داده‌های خام (JSON) را بخوانید. در عوض، باید نتایج را به صورت یک خلاصه مفید و محاوره‌ای به امیر ارائه دهید. مثال: "امیر جان، ۳ مورد آپارتمان فروشی در نیاوران پیدا کردم. یکی ۱۲۰ متره و..."
                3.  **دسترسی به اینترنت:** شما از طریق Google Search به اطلاعات روز دنیا دسترسی دارید و می‌توانید به سوالات عمومی پاسخ دهید.

                **قوانین اصلی:**
                - **مهم‌ترین وظیفه شما خلاصه‌سازی است.** وقتی ابزاری را فراخوانی می‌کنید و نتیجه‌ای (مثلاً یک لیست از آگهی‌ها) دریافت می‌کنید، آن را به شکل یک جمله یا چند جمله کوتاه، طبیعی و قابل فهم برای امیر خلاصه کنید.
                - همیشه امیر را با نامش ("امیر عزیز"، "جانم امیر") خطاب کنید.
                - اگر سوالی مربوط به اطلاعات داخل برنامه است (جستجوی آگهی یا مشتری)، از ابزارهای مربوطه استفاده کنید.
                - هرگز نگویید "من یک مدل زبان هستم". شما "الکسا" هستید.
                - خلاصه داده‌های فعلی برنامه این است: ${dataContext}. برای سوالات مربوط به برنامه، ابتدا به این داده‌ها رجوع کنید.`;

                sessionPromise = ai.live.connect({
                    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                    callbacks: {
                        onopen: () => {
                            setLiveTranscript("سلام امیر عزیز، بفرمایید...");
                            resetInactivityTimer();
                            const source = inputAudioContext!.createMediaStreamSource(audioStream!);
                            scriptProcessor = inputAudioContext!.createScriptProcessor(4096, 1, 1);
                            scriptProcessor.onaudioprocess = (event) => sessionPromise?.then(session => session.sendRealtimeInput({ media: createBlob(event.inputBuffer.getChannelData(0)) }));
                            source.connect(scriptProcessor);
                            scriptProcessor.connect(inputAudioContext!.destination);
                        },
                        onmessage: async (msg: LiveServerMessage) => {
                            resetInactivityTimer();
                            if (msg.serverContent?.inputTranscription?.text) setLiveTranscript(userTranscript += msg.serverContent.inputTranscription.text);
                            if (msg.serverContent?.outputTranscription?.text) setLiveTranscript(modelTranscript += msg.serverContent.outputTranscription.text);
                            if (msg.serverContent?.turnComplete) { userTranscript = ''; modelTranscript = ''; }
                            
                            if (msg.toolCall) {
                                for (const fc of msg.toolCall.functionCalls) {
                                    let result: any = { status: 'ERROR', message: 'Function not found' };
                                    if (fc.name === 'searchListings') {
                                        const { query, minPrice, maxPrice, minArea, maxArea } = fc.args;
                                        // FIX: The properties of `fc.args` are of type `unknown`. They are cast to their expected types
                                        // (`string`, `number`) inline to resolve TypeScript errors. The boolean short-circuiting
                                        // (`!query || ...`) prevents runtime errors if the arguments are not provided.
                                        const found = listings.filter(l => 
                                            (!query || l.address.includes(query as string) || l.ownerName.includes(query as string)) &&
                                            (!minPrice || (l.totalPrice || l.deposit || 0) >= (minPrice as number)) &&
                                            (!maxPrice || (l.totalPrice || l.deposit || 0) <= (maxPrice as number)) &&
                                            (!minArea || l.area >= (minArea as number)) &&
                                            (!maxArea || l.area <= (maxArea as number))
                                        );
                                        result = found.length > 0 ? found.slice(0,3) : { status: 'NOT_FOUND', message: 'هیچ آگهی با این مشخصات یافت نشد.'};
                                    } else if (fc.name === 'getClientDetails') {
                                        const { name } = fc.args;
                                        // FIX: The `name` property from `fc.args` is of type `unknown` and must be cast to
                                        // a string before being passed to `String.prototype.includes()`.
                                        const found = clients.find(c => c.name.includes(name as string));
                                        result = found ? found : { status: 'NOT_FOUND', message: 'مشتری با این نام یافت نشد.' };
                                    }
                                    sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: JSON.stringify(result) } } }));
                                }
                            }
                            
                            const audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                            if (audio) {
                                nextStartTime = Math.max(nextStartTime, liveOutputAudioContext.currentTime);
                                const buffer = await decodeAudioData(decode(audio), liveOutputAudioContext, 24000, 1);
                                const sourceNode = liveOutputAudioContext.createBufferSource();
                                sourceNode.buffer = buffer;
                                sourceNode.connect(outputNode);
                                sourceNode.addEventListener('ended', () => sources.delete(sourceNode));
                                sourceNode.start(nextStartTime);
                                nextStartTime += buffer.duration;
                                sources.add(sourceNode);
                            }
                            if (msg.serverContent?.interrupted) { sources.forEach(s => s.stop()); sources.clear(); nextStartTime = 0; }
                        },
                        onerror: (e) => console.error("Live Session Error:", e),
                        onclose: () => {},
                    },
                    config: { 
                        responseModalities: [Modality.AUDIO], 
                        inputAudioTranscription: {}, 
                        outputAudioTranscription: {}, 
                        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }, 
                        systemInstruction,
                        tools: [{ googleSearch: {} }, { functionDeclarations: [searchListingsFn, getClientDetailsFn] }]
                    },
                });
            } catch (error) {
                console.error("Voice session setup failed:", error);
                setLiveTranscript("دسترسی به میکروفون امکان‌پذیر نیست.");
                setTimeout(() => setVoiceSessionActive(false), 3000);
            }
        };
        setup();
        return () => {
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
            sessionPromise?.then(session => session.close());
            audioStream?.getTracks().forEach(track => track.stop());
            inputAudioContext?.close().catch(console.error);
            scriptProcessor?.disconnect();
            setLiveTranscript('');
        };
    }, [isVoiceSessionActive, setVoiceSessionActive, setLiveTranscript, listings, clients, addReminder]);

    return <MainApp />;
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
} else {
    console.error("Fatal: Root element not found in the DOM.");
    document.body.innerHTML = '<div style="color: red; font-family: sans-serif; text-align: center; padding-top: 2rem;"><h1>Error</h1><p>Application could not be started because the root DOM element was not found.</p></div>';
}
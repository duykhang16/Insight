import {
    Wrench, Globe, Users, PlayCircle, LayoutList, Gamepad2,
    MessageCircle, Briefcase, ShoppingBag, GraduationCap,
    Heart, Newspaper, Plug, ShieldAlert, Lock, Landmark, HelpCircle
} from 'lucide-react';

/**
 * Advanced mapping for Application Categories
 * Based on technical keys from API
 */
export const CATEGORY_DETAILS = {
    'utilities': {
        name: 'Utilities',
        icon: Wrench,
        hex: '#64748b'
    },
    'web': {
        name: 'Web',
        icon: Globe,
        hex: '#10b981'
    },
    'social-network': {
        name: 'Social Network',
        icon: Users,
        hex: '#3b82f6'
    },
    'streaming': {
        name: 'Streaming',
        icon: PlayCircle,
        hex: '#ef4444'
    },
    'productivity': {
        name: 'Productivity',
        icon: LayoutList,
        hex: '#f59e0b'
    },
    'gaming': {
        name: 'Gaming',
        icon: Gamepad2,
        hex: '#6366f1'
    },
    'instant-messaging-and-email': {
        name: 'Instant Messaging and Email',
        icon: MessageCircle,
        hex: '#8b5cf6'
    },
    'business-and-economy': {
        name: 'Business and Economy',
        icon: Briefcase,
        hex: '#06b6d4'
    },
    'shopping': {
        name: 'Shopping',
        icon: ShoppingBag,
        hex: '#ec4899'
    },
    'education': {
        name: 'Education',
        icon: GraduationCap,
        hex: '#14b8a6'
    },
    'lifestyle': {
        name: 'Lifestyle',
        icon: Heart,
        hex: '#f43f5e'
    },
    'news-and-media': {
        name: 'News and Media',
        icon: Newspaper,
        hex: '#84cc16'
    },
    'wired': {
        name: 'Wired Traffic',
        icon: Plug,
        hex: '#94a3b8'
    },
    'malicious-and-risk': {
        name: 'Malicious and Risk',
        icon: ShieldAlert,
        hex: '#b91c1c'
    },
    'adult-content': {
        name: 'Adult Content',
        icon: Lock,
        hex: '#78350f'
    },
    'government-and-politics': {
        name: 'Government and Politics',
        icon: Landmark,
        hex: '#1e40af'
    },
    'unknown': {
        name: 'Uncategorized',
        icon: HelpCircle,
        hex: '#475569'
    }
};

/**
 * Converts slug to Title Case (e.g., "new-category" -> "New Category")
 */
export const toTitleCase = (str) => {
    if (!str) return '';
    return str.split('-').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
};

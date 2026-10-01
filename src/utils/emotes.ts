import { EmoteItem } from '../types/uno.js';

export const EMOTE_CATALOG: EmoteItem[] = [
  {
    id: 'laugh',
    emoji: '🤣',
    label: 'Zoando / Rindo',
    phrase: 'Hahaha!',
  },
  {
    id: 'joga_pouco',
    emoji: '🤡',
    label: 'Provocando',
    phrase: 'Joga pouco!',
  },
  {
    id: 'ahaa',
    emoji: '😏',
    label: 'Ahaa!',
    phrase: 'Ahaa!',
  },
  {
    id: 'e_agora',
    emoji: '😱',
    label: 'E agora?!',
    phrase: 'E agora?!',
  },
  {
    id: 'cry',
    emoji: '😭',
    label: 'Chorando',
    phrase: 'Ferrou!',
  },
  {
    id: 'happy',
    emoji: '😄',
    label: 'Feliz',
    phrase: 'Boa!',
  },
  {
    id: 'party',
    emoji: '🥳',
    label: 'Comemorando',
    phrase: 'Uhuuul!',
  },
  {
    id: 'angry',
    emoji: '😡',
    label: 'Bravo / Tilt',
    phrase: 'Não acredito!',
  },
  {
    id: 'mindblown',
    emoji: '🤯',
    label: 'Chocado',
    phrase: 'Inacreditável!',
  },
  {
    id: 'sleepy',
    emoji: '🥱',
    label: 'Provocando',
    phrase: 'Dorme não!',
  },
];

export const EMOTES_MAP: Record<string, EmoteItem> = EMOTE_CATALOG.reduce(
  (acc, emote) => {
    acc[emote.id] = emote;
    return acc;
  },
  {} as Record<string, EmoteItem>
);

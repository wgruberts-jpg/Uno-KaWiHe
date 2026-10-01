export interface AvatarItem {
  emoji: string;
  name: string;
  category: 'heroes' | 'animals' | 'classics';
}

export const AVATAR_CATEGORIES = [
  { id: 'heroes', label: '🦸 Heróis' },
  { id: 'animals', label: '🐾 Bichinhos' },
  { id: 'classics', label: '⭐ Clássicos' },
] as const;

export const AVATARS_CATALOG: AvatarItem[] = [
  // Super-Heróis
  { emoji: '🦸‍♂️', name: 'Super-Herói', category: 'heroes' },
  { emoji: '🦸‍♀️', name: 'Super-Heroína', category: 'heroes' },
  { emoji: '🕷️', name: 'Herói Aranha', category: 'heroes' },
  { emoji: '🦇', name: 'Cavaleiro da Noite', category: 'heroes' },
  { emoji: '⚡', name: 'Velocista Raio', category: 'heroes' },
  { emoji: '🛡️', name: 'Capitão com Escudo', category: 'heroes' },
  { emoji: '🔨', name: 'Deus do Trovão', category: 'heroes' },
  { emoji: '🤖', name: 'Armadura de Aço', category: 'heroes' },
  { emoji: '🏹', name: 'Arqueiro Valente', category: 'heroes' },
  { emoji: '🟢', name: 'Gigante Forte', category: 'heroes' },
  { emoji: '🔥', name: 'Tocha de Fogo', category: 'heroes' },
  { emoji: '❄️', name: 'Mago do Gelo', category: 'heroes' },
  { emoji: '🥷', name: 'Ninja Veloz', category: 'heroes' },
  { emoji: '🦹‍♂️', name: 'Vilão Travesso', category: 'heroes' },

  // Animais & Fofuras
  { emoji: '🦁', name: 'Leãozinho', category: 'animals' },
  { emoji: '🦊', name: 'Raposinha', category: 'animals' },
  { emoji: '🐼', name: 'Pandinha', category: 'animals' },
  { emoji: '🐯', name: 'Tigrinho', category: 'animals' },
  { emoji: '🦄', name: 'Unicórnio Mágico', category: 'animals' },
  { emoji: '🦖', name: 'Dino T-Rex', category: 'animals' },
  { emoji: '🐶', name: 'Cachorrinho', category: 'animals' },
  { emoji: '🐱', name: 'Gatinho', category: 'animals' },
  { emoji: '🐵', name: 'Macaquinho', category: 'animals' },
  { emoji: '🐬', name: 'Golfinho', category: 'animals' },

  // Clássicos & Jogos
  { emoji: '🎮', name: 'Gamer', category: 'classics' },
  { emoji: '🚀', name: 'Foguete', category: 'classics' },
  { emoji: '👑', name: 'Coroa Real', category: 'classics' },
  { emoji: '⚡', name: 'Energia', category: 'classics' },
  { emoji: '🍀', name: 'Sorte', category: 'classics' },
  { emoji: '🎲', name: 'Dado da Sorte', category: 'classics' },
  { emoji: '🍕', name: 'Pizza', category: 'classics' },
  { emoji: '⭐', name: 'Estrela', category: 'classics' },
];

export const ALL_AVATARS = AVATARS_CATALOG.map((a) => a.emoji);

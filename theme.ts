// theme.ts — Charte Graphique Officielle Kêkênon (Driver App)
// Palette : Jaune Kêkênon (#FDD835) + Or (#FFD700) + Noir + Blanc

export const Colors = {
  // --- Couleurs Primaires Kêkênon ---
  primary: '#FDD835',       // Jaune vif Kêkênon — interrupteur En Ligne, boutons actifs
  primaryDark: '#F9A825',   // Jaune foncé / Ambre — survol, états pressés
  secondary: '#FFC107',     // Ambre chaud — badges, étoiles de notation, gains
  secondaryDark: '#F9A825', // @compat — même valeur que primaryDark
  cta: '#FFD700',           // Or pur — boutons Accepter, Terminer la course

  // --- Neutres ---
  white: '#FFFFFF',
  black: '#212121',         // Noir texte principal
  dark: '#1A1A1A',          // Noir profond pour fonds sombres
  gray: '#9E9E9E',          // Gris textes secondaires
  mediumGray: '#BDBDBD',    // Gris icônes discrètes
  lightGray: '#F5F5F5',     // Fond léger / séparateurs
  background: '#FAFAFA',    // Fond général de l'app
  surface: '#FFFFFF',       // Fond des cartes et modales
  border: '#E0E0E0',        // Bordures de séparation

  // --- États ---
  error: '#E53935',         // Rouge erreur / Refuser
  success: '#43A047',       // Vert succès / Course terminée
  warning: '#FFA000',       // Orange avertissement
  info: '#757575',          // Gris neutre pour information

  // --- Glassmorphism / Overlay ---
  glass: 'rgba(255, 255, 255, 0.85)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  primaryOverlay: 'rgba(253, 216, 53, 0.15)', // Jaune Kêkênon transparent
};

export const Gradients = {
  primary: [Colors.primary, Colors.primaryDark] as const,
  gold: ['#FFD700', '#FFC107', '#F9A825'] as const,
  dark: ['#1A1A1A', '#2C2C2C'] as const,
  surface: ['#FFFFFF', '#FAFAFA'] as const,
  success: [Colors.success, '#2E7D32'] as const,
  wallet: ['#FDD835', '#FFC107', '#F9A825'] as const, // @compat — gradient portefeuille
  glass: ['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.05)'] as const,
} as const;

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
};

export const Fonts = {
  light: 'Rajdhani-Light',
  regular: 'Rajdhani-Regular',
  medium: 'Rajdhani-Medium',
  semiBold: 'Rajdhani-SemiBold',
  bold: 'Rajdhani-Bold',
};

export default { Colors, Gradients, Shadows };

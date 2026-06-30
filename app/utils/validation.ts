/**
 * Service de validation côté client
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Valide un numéro de téléphone béninois
 */
export const validatePhoneNumber = (phone: string): ValidationResult => {
  const cleaned = phone.replace(/\s/g, '');
  
  if (!cleaned) {
    return { isValid: false, error: 'Le numéro de téléphone est requis' };
  }

  // Format béninois : 8 chiffres (sans le +229)
  const phoneRegex = /^[0-9]{8}$/;
  
  if (!phoneRegex.test(cleaned)) {
    return { 
      isValid: false, 
      error: 'Le numéro doit contenir 8 chiffres (ex: 90 12 34 56)' 
    };
  }

  return { isValid: true };
};

/**
 * Valide un code OTP
 */
export const validateOTP = (code: string): ValidationResult => {
  if (!code || code.trim().length === 0) {
    return { isValid: false, error: 'Le code OTP est requis' };
  }

  if (code.trim().length !== 6) {
    return { isValid: false, error: 'Le code doit contenir 6 chiffres' };
  }

  const otpRegex = /^[0-9]{6}$/;
  if (!otpRegex.test(code.trim())) {
    return { isValid: false, error: 'Le code doit contenir uniquement des chiffres' };
  }

  return { isValid: true };
};

/**
 * Valide des coordonnées GPS
 */
export const validateCoordinates = (lat: number, lng: number): ValidationResult => {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { isValid: false, error: 'Les coordonnées doivent être des nombres' };
  }

  if (isNaN(lat) || isNaN(lng)) {
    return { isValid: false, error: 'Les coordonnées ne peuvent pas être NaN' };
  }

  if (lat < -90 || lat > 90) {
    return { isValid: false, error: 'La latitude doit être entre -90 et 90' };
  }

  if (lng < -180 || lng > 180) {
    return { isValid: false, error: 'La longitude doit être entre -180 et 180' };
  }

  return { isValid: true };
};

/**
 * Valide un email (optionnel pour les notifications)
 */
export const validateEmail = (email: string): ValidationResult => {
  if (!email || email.trim().length === 0) {
    return { isValid: false, error: 'L\'email est requis' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { isValid: false, error: 'Format d\'email invalide' };
  }

  return { isValid: true };
};

/**
 * Valide un nom (prénom/nom)
 */
export const validateName = (name: string): ValidationResult => {
  if (!name || name.trim().length === 0) {
    return { isValid: false, error: 'Le nom est requis' };
  }

  if (name.trim().length < 2) {
    return { isValid: false, error: 'Le nom doit contenir au moins 2 caractères' };
  }

  if (name.trim().length > 50) {
    return { isValid: false, error: 'Le nom ne peut pas dépasser 50 caractères' };
  }

  return { isValid: true };
};

/**
 * Valide un montant (prix)
 */
export const validateAmount = (amount: number): ValidationResult => {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return { isValid: false, error: 'Le montant doit être un nombre' };
  }

  if (amount < 0) {
    return { isValid: false, error: 'Le montant ne peut pas être négatif' };
  }

  if (amount > 1000000) {
    return { isValid: false, error: 'Le montant est trop élevé' };
  }

  return { isValid: true };
};


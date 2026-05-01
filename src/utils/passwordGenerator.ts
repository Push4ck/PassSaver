export interface GeneratorOptions {
  length: number;
  uppercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

export const DEFAULT_OPTIONS: GeneratorOptions = {
  length: 16,
  uppercase: true,
  numbers: true,
  symbols: true,
};

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUMBERS = "0123456789";
const SYMBOLS = "!@#$%^&*()_+-=[]{}|;:,.<>?";

export const generatePassword = (options: GeneratorOptions): string => {
  let charset = LOWERCASE;
  if (options.uppercase) charset += UPPERCASE;
  if (options.numbers) charset += NUMBERS;
  if (options.symbols) charset += SYMBOLS;

  let password = "";

  // Guarantee at least one char from each enabled set
  if (options.uppercase)
    password += UPPERCASE[Math.floor(Math.random() * UPPERCASE.length)];
  if (options.numbers)
    password += NUMBERS[Math.floor(Math.random() * NUMBERS.length)];
  if (options.symbols)
    password += SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

  for (let i = password.length; i < options.length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }

  // Shuffle
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
};

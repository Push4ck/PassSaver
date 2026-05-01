export type Category =
  | "Social"
  | "Banking"
  | "Email"
  | "Work"
  | "Shopping"
  | "Gaming"
  | "Other";

export interface PasswordEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  category: Category;
  notes: string;
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
}

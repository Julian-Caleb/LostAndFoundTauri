export interface Item {
  id: string;
  code?: string;
  name: string;
  status: "lost" | "found";
  type: "Phone" | "Card" | "Cosplay Props" | "Wallet" | "Bag / Pouch" | "Merch" | "Miscellaneous";
  location: string;
  description: string;
  contact: string;
  solved: boolean;
  image: string | null;
  created_at: Date;
}


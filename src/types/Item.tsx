export interface Item {
  id: string;
  name: string;
  status: "lost" | "found";
  type: "Phone" | "Document" | "Wallet" | "Miscellaneous";
  location: string;
  description: string;
  contact: string;
  solved: boolean;
  image: string | null;
}


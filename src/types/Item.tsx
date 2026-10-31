import { ItemType } from "./ItemType";

export interface Item {
  id: string;
  tag_id?: string | null;
  name: string;
  status: 'found' | 'lost';
  type: ItemType;
  location: string;
  description: string;
  contact: string;
  solved: boolean;
  image?: string;
  item_code?: string; 
  created_at?: string;
  updated_at?: string;
}
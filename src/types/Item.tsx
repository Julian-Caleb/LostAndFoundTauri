export interface Item {
  id: string;
  name: string;
  status: 'found' | 'lost';
  type: string;
  location: string;
  description: string;
  contact: string;
  solved: boolean;
  image?: string;
  item_code?: string; 
  created_at?: string;
}
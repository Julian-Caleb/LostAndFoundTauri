import Database from '@tauri-apps/plugin-sql';
import type { Item } from '../types/Item';

let db: Database | null = null;

export async function initDatabase() {
  if (db) return db;
  
  db = await Database.load('sqlite:lostfound.db');
  
  // Create table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      type TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      contact TEXT NOT NULL,
      solved INTEGER DEFAULT 0,
      image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log('Database initialized');
  return db;
}

export async function getFoundItems(): Promise<Item[]> {
  const database = await initDatabase();
  const items = await database.select<Item[]>(
    "SELECT * FROM items WHERE status = 'found' ORDER BY created_at DESC"
  );
  console.log('Found items from database:', items);
  return items;
}

export async function getLostItems(): Promise<Item[]> {
  const database = await initDatabase();
  const items = await database.select<Item[]>(
    "SELECT * FROM items WHERE status = 'lost' ORDER BY created_at DESC"
  );
  console.log('Lost items from database:', items);
  return items;
}

export async function getAllItems(): Promise<Item[]> {
  const database = await initDatabase();
  const items = await database.select<Item[]>(
    "SELECT * FROM items ORDER BY created_at DESC"
  );
  console.log('All items from database:', items);
  return items;
}

export async function addItem(item: Omit<Item, 'id' | 'created_at'>): Promise<void> {
  const database = await initDatabase();
  const id = crypto.randomUUID();
  
  console.log('Adding item:', { id, ...item });
  
  await database.execute(
    `INSERT INTO items (id, name, status, type, location, description, contact, solved, image)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, item.name, item.status, item.type, item.location, item.description, item.contact, item.solved ? 1 : 0, item.image]
  );
  
  console.log('Item added successfully');
  
  // Verify item was added
  const verifyItems = await database.select<Item[]>(
    "SELECT * FROM items WHERE id = $1",
    [id]
  );
  console.log('Verification - Item in database:', verifyItems);
}

export async function updateItemSolvedStatus(id: string, solved: boolean): Promise<void> {
  const database = await initDatabase();
  await database.execute(
    `UPDATE items SET solved = $1 WHERE id = $2`,
    [solved ? 1 : 0, id]
  );
  console.log(`Item ${id} solved status updated to:`, solved);
}

export async function getItemById(id: string): Promise<Item | null> {
  const database = await initDatabase();
  const results = await database.select<Item[]>(
    "SELECT * FROM items WHERE id = $1",
    [id]
  );
  return results.length > 0 ? results[0] : null;
}

export async function updateItem(item: Item): Promise<void> {
  const database = await initDatabase();
  await database.execute(
    `UPDATE items 
     SET name = $1, 
         type = $2, 
         location = $3, 
         description = $4, 
         contact = $5, 
         status = $6, 
         solved = $7, 
         image = $8
     WHERE id = $9`,
    [
      item.name,
      item.type,
      item.location,
      item.description,
      item.contact,
      item.status,
      item.solved ? 1 : 0,
      item.image,
      item.id,
    ]
  );
  console.log(`Item ${item.id} updated successfully`);
}
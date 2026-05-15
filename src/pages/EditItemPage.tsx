import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Item } from "../types/Item";
import { getItemById, updateItem } from "../services/database";

function EditItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<Item | null>(null);

  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    const loadItem = async () => {
      if (!id) return;
      const foundItem = await getItemById(id);
      if (foundItem) setItem(foundItem);
    };
    loadItem();
  }, [id]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleSave = async () => {
    if (!item) return;
    await updateItem(item);
    setNotification("Item updated succesfully!");
    setTimeout(() => {
      navigate(-1);
    }, 1500);
  };

  if (!item) return <div className="p-6 text-center text-gray-500">Loading item...</div>;

  return (
    <div className="p-8 max-w-lg mx-auto">

      {notification && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div className={`px-6 py-3 rounded-lg shadow-lg ${
            (notification.includes("Error"))
              ? "bg-red-500 text-white" 
              : "bg-green-500 text-white"
          }`}>
            {notification}
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold mb-6 text-center">Edit Item</h1>

      <label className="block mb-2 font-semibold">Name</label>
      <input
        type="text"
        value={item.name}
        onChange={(e) => setItem({ ...item, name: e.target.value })}
        className="border p-2 w-full mb-4 rounded"
      />

      <label className="block mb-2 font-semibold">Type</label>
      <select
        value={item.type}
        onChange={(e) => setItem({ ...item, type: e.target.value as Item["type"] })}
        className="border p-2 w-full mb-4 rounded"
        >
            <option value="Phone">Phone</option>
            <option value="Card">Card</option>
            <option value="Cosplay Props">Cosplay Props</option>
            <option value="Wallet">Walllet</option>
            <option value="Bag / Pouch">Bag / Pouch</option>
            <option value="Merch">Merch</option>
            <option value="Miscellaneous">Miscellaneous</option>
      </select>

      <label className="block mb-2 font-semibold">Location</label>
      <input
        type="text"
        value={item.location}
        onChange={(e) => setItem({ ...item, location: e.target.value })}
        className="border p-2 w-full mb-4 rounded"
      />

      <label className="block mb-2 font-semibold">Contact</label>
      <input
        type="text"
        value={item.contact}
        onChange={(e) => setItem({ ...item, contact: e.target.value })}
        className="border p-2 w-full mb-4 rounded"
      />

      <label className="block mb-2 font-semibold">Description</label>
      <textarea
        value={item.description}
        onChange={(e) => setItem({ ...item, description: e.target.value })}
        className="border p-2 w-full mb-6 rounded h-24"
      />

      <div className="flex justify-between">
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-gray-400 rounded hover:bg-gray-500 text-white"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-700 rounded hover:bg-blue-500 text-white"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}

export default EditItemPage;

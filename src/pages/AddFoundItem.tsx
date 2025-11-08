import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addItem } from "../services/database";
import type { Item } from "../types/Item";
import { BaseDirectory, readDir, readFile } from '@tauri-apps/plugin-fs';
import { QRCodeCanvas } from "qrcode.react";
import { invoke } from '@tauri-apps/api/core';

type ItemType = "Phone" | "Document" | "Wallet" | "Miscellaneous";

function AddFoundItem() {
  const navigate = useNavigate();
  const [name, setName] = useState<string>("");
  const [type, setType] = useState<ItemType>("Phone");
  const [location, setLocation] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [contact, setContact] = useState<string>("");
  const [imagePath, setImagePath] = useState<string>("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [notification, setNotification] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string>("http://127.0.0.1:8080");
  const [latestImage, setLatestImage] = useState<string | null>(null);

  useEffect(() => {
    const fetchLocalIp = async () => {
      try {
        const ip = await invoke<string>('get_local_ip');
        setQrUrl(`http://${ip}:8080`);
      } catch (err) {
        console.warn("Failed to get local IP, falling back to localhost");
        setQrUrl("http://127.0.0.1:8080");
      }
    };
    fetchLocalIp();
  }, []);

  const scanForImages = async () => {
    try {
      const entries = await readDir("temp_images", { baseDir: BaseDirectory.AppData });
      const imageFiles = entries
        .filter(file => file.name?.startsWith("temp_") && file.name?.endsWith(".jpg"))
        .map(file => file.name!)
        .sort((a, b) => b.localeCompare(a));

      if (imageFiles.length > 0) {
        const latest = imageFiles[0];
        const fullPath = `temp_images/${latest}`;

        const rawData = await readFile(fullPath, {
          baseDir: BaseDirectory.AppData
        }) as Uint8Array;

        const safeBytes = new Uint8Array(rawData);
        const bitmap = await createImageBitmap(new Blob([safeBytes], { type: 'image/jpeg' }));

        const canvas = document.createElement('canvas');
        const maxSize = 200;
        const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
        canvas.width = bitmap.width * scale;
        canvas.height = bitmap.height * scale;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        setLatestImage(latest);
        setImagePath(fullPath);
        setImagePreview(dataUrl);
        setMessage(`Image detected: ${latest}`);
      } else {
        setMessage("No images found.");
        setImagePreview(null);
      }
    } catch (err) {
      console.error("Failed to scan for images", err);
      setMessage("Failed to scan upload folder.");
      setImagePreview(null);
    }
  };

  const goBack = () => {
    navigate('/');
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      setMessage("");

      const newItem: Omit<Item, 'id' | 'created_at'> = {
        name,
        status: "found",
        type,
        location,
        description,
        contact,
        solved: false,
        image: imagePath
      };

      await addItem(newItem);
      setNotification("Found item added successfully!");

      setTimeout(() => navigate('/'), 1500);
    } catch (error) {
      console.error('Error adding item:', error);
      const msg = error instanceof Error ? error.message : String(error);
      setNotification("Error adding item: " + msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div className={`px-6 py-3 rounded-lg shadow-lg ${
            notification.includes("Error") ? "bg-red-500 text-white" : "bg-green-500 text-white"
          }`}>
            {notification}
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Add Found Item</h2>
        <button
          onClick={goBack}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Back
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded ${
          message.includes('successfully') || message.includes('detected')
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {message}
        </div>
      )}

      <div className="mb-6 flex flex-col items-center p-4 border rounded bg-gray-50">
        <h3 className="font-medium mb-2">📸 Use Your Phone Camera</h3>
        <p className="text-sm text-gray-600 mb-3 text-center">
          Scan the QR code below to upload a photo from your phone
        </p>
        <QRCodeCanvas value={qrUrl} size={180} />
        <p className="mt-2 text-xs text-gray-500 break-all">{qrUrl}</p>
      </div>

      <div className="mb-6">
        <button
          type="button"
          onClick={scanForImages}
          className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600"
        >
          Scan for Uploaded Images
        </button>
        {latestImage && (
          <p className="mt-2 text-sm text-green-600">
            ✅ Selected: {latestImage}
          </p>
        )}
      </div>

      {imagePreview && (
        <div className="mb-4 flex flex-col items-center">
          <p className="text-sm text-gray-600 mb-1">Preview:</p>
          <img
            src={imagePreview}
            alt="Uploaded preview"
            className="max-w-32 max-h-32 object-cover rounded border"
          />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium mb-1">Item Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Item Name"
          required
        />

        <label className="block text-sm font-medium mb-1">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ItemType)}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        >
          <option value="Phone">Phone</option>
          <option value="Document">Document</option>
          <option value="Wallet">Wallet</option>
          <option value="Miscellaneous">Miscellaneous</option>
        </select>

        <label className="block text-sm font-medium mb-1">Location Found</label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Location Found"
          required
        />

        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Description"
          required
        />

        <label className="block text-sm font-medium mb-1">Contact</label>
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Contact"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 px-4 rounded text-white font-medium ${
            loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {loading ? 'Adding...' : 'Add Found Item'}
        </button>
      </form>
    </div>
  );
}

export default AddFoundItem;
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addItem, getAllItems } from "../services/database";
import type { Item } from "../types/Item";
import { BaseDirectory, exists, mkdir, writeFile } from '@tauri-apps/plugin-fs';

type ItemType = "Phone" | "Document" | "Wallet" | "Miscellaneous";

function AddLostItem() {
  const navigate = useNavigate();
  const [name, setName] = useState<string>("");
  const [type, setType] = useState<ItemType>("Phone");
  const [location, setLocation] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [contact, setContact] = useState<string>("");
  const [imagePath, setImagePath] = useState<string>("");
  const [imageBlob, setImageBlob] = useState<Uint8Array>(new Uint8Array());
  
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [notification, setNotification] = useState<string | null>(null);

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;

    canvas.width = 400;
    canvas.height = 300;

    const ctx = canvas.getContext("2d");
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );
    if (!blob) return;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    setImageBlob(bytes);

    const fileName = `lost_${Date.now()}.jpg`;
    const folderPath = 'lost_images';
    const fullPath = `${folderPath}/${fileName}`;
    setImagePath(fullPath);
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      videoRef.current!.srcObject = null;
    }
  };

  const goBack = () => {
    stopCamera();
    navigate('/');
  };

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera error:", err);
        setMessage("Failed to access camera");
      }
    };
    
    
    startCamera();

    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);

      return () => {
        stopCamera();
        clearTimeout(timer);
      };
    }
  }, [notification]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // if (!name || !type || !location || !description || !contact) {
    //   setMessage("Please fill all fields");
    //   return;
    // }

    try {
      setLoading(true);
      setMessage("");

      if (imagePath != "") {
        const folderPath = 'lost_images';
        const folderExist = await exists(folderPath, {
          baseDir: BaseDirectory.AppData,
        });

        if (!folderExist) {
          await mkdir(folderPath, {
            baseDir: BaseDirectory.AppData,
          });
        }

        await writeFile(imagePath, imageBlob, {
          baseDir: BaseDirectory.AppData,
        });
      }

      const newItem: Omit<Item, 'id' | 'created_at'> = {
        name,
        status: "lost",
        type,
        location,
        description,
        contact,
        solved: false,
        image: imagePath
      };

      await addItem(newItem);
      setMessage("Item added successfully!");
      
      const allItems = await getAllItems();
      console.log('Total items in database after adding:', allItems.length);

      setNotification("Found item added succesfully!");
      
      stopCamera();
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (error) {
      console.error('Error adding item:', error);
      setMessage("Failed to add item: " + error);
      setNotification("Error adding item: " + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
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
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Add Lost Item</h2>
        <button
          onClick={() => goBack()}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Back
        </button>
      </div>
      
      {message && (
        <div className={`mb-4 p-3 rounded ${message.includes('successfully') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message}
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-48 h-36 rounded border mb-4"
      />

      <button
        className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer"
        onClick={captureImage}
      >
        Capture
      </button>
  
      <canvas className="mb-4" ref={canvasRef}></canvas>

      <form onSubmit={handleSubmit} className="space-y-4">
        
        <label className="block text-sm font-medium mb-1">Item Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Item Name"
        />
      
        <label className="block text-sm font-medium mb-1">Type</label>
        <select
            value={type}
            onChange={(e) => setType(e.target.value as ItemType)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
            <option value="Phone">Phone</option>
            <option value="Document">Document</option>
            <option value="Wallet">Wallet</option>
            <option value="Miscellaneous">Miscellaneous</option>
        </select>
      
        <label className="block text-sm font-medium mb-1">Last Known Location</label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Last Known Location"
        />

        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Description"
        />
      
        <label className="block text-sm font-medium mb-1">Contact</label>
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Contact"
        />

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 px-4 rounded text-white font-medium ${
            loading 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {loading ? 'Adding...' : 'Add Lost Item'}
        </button>
      </form>
    </div>
  );
}

export default AddLostItem;
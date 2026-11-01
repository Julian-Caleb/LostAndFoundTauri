import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addItem } from "../services/database";
import type { Item } from "../types/Item";
import { BaseDirectory, exists, mkdir, writeFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import QRCode from 'qrcode';
import { ItemType } from "../types/ItemType";
import ImageSourcePicker from "../components/ImageSourcePicker";

interface ConnectionInfo {
  ip: string;
  port: number;
}

// Receive phone image and create found item.
function AddFoundItemPhone() {
  const navigate = useNavigate();
  const [name, setName] = useState<string>("");
  const [type, setType] = useState<ItemType>("Phone");
  const [location, setLocation] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [imagePath, setImagePath] = useState<string>("");
  const [imageBlob, setImageBlob] = useState<Uint8Array>(new Uint8Array());

  // TCP Server states
  const [serverRunning, setServerRunning] = useState<boolean>(false);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [phoneConnected, setPhoneConnected] = useState<boolean>(false);
  
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [addedTagId, setAddedTagId] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  const handleImageSelected = async (image: Blob, fileName: string) => {
    const bytes = new Uint8Array(await image.arrayBuffer());
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fullPath = `found_images/found_${Date.now()}_${safeFileName}`;
    setImageBlob(bytes);
    setImagePath(fullPath);

    const url = URL.createObjectURL(image);
    const previewImage = new Image();
    previewImage.onload = () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (canvas && context) {
        canvas.width = previewImage.width;
        canvas.height = previewImage.height;
        context.drawImage(previewImage, 0, 0);
      }
      URL.revokeObjectURL(url);
    };
    previewImage.src = url;
  };

  // Start TCP Server
  // Start Tcp server and generate QR code for phone.
const startTcpServer = async () => {
    try {
      setMessage("Starting server...");
      const result: ConnectionInfo = await invoke('start_tcp_server');
      setConnectionInfo(result);
      setServerRunning(true);
      
      // Generate QR Code
      const connectionData = JSON.stringify({
        ip: result.ip,
        port: result.port,
        type: 'found_item_upload'
      });
      
      const qrUrl = await QRCode.toDataURL(connectionData, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
      
      setQrCodeUrl(qrUrl);
      setMessage(`Server started on ${result.ip}:${result.port}`);
      
      // Start polling for images
      startPolling();
    } catch (error) {
      console.error('Failed to start TCP server:', error);
      setMessage('Failed to start server: ' + error);
      setNotification('Failed to start server: ' + error);
    }
  };

  // Poll for incoming images
  // Poll backend periodically for incoming phone images.
const startPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = window.setInterval(async () => {
      try {
        const imageData: { data: number[], filename: string } = await invoke('receive_image');
        
        if (imageData && imageData.data.length > 0) {
          setPhoneConnected(true);
          const bytes = new Uint8Array(imageData.data);
          setImageBlob(bytes);

          const fileName = `found_${Date.now()}.jpg`;
          const folderPath = 'found_images';
          const fullPath = `${folderPath}/${fileName}`;
          setImagePath(fullPath);

          // Display preview on canvas
          const blob = new Blob([bytes], { type: 'image/jpeg' });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            if (canvasRef.current) {
              const canvas = canvasRef.current;
              canvas.width = 400;
              canvas.height = 300;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
            }
            URL.revokeObjectURL(url);
          };
          img.src = url;

          setNotification("Image received from phone!");
          setMessage("Image received successfully!");
        }
      } catch (error) {
        // No image available yet, continue polling
        // Don't log errors to avoid console spam
      }
    }, 500); // Poll every 500ms
  };

  // Stop polling for incoming phone images.
const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Stop TCP Server
  // Stop Tcp server and clear connection state.
const stopTcpServer = async () => {
    try {
      stopPolling();
      await invoke('stop_tcp_server');
      setServerRunning(false);
      setConnectionInfo(null);
      setQrCodeUrl("");
      setPhoneConnected(false);
      setMessage("Server stopped");
    } catch (error) {
      console.error('Failed to stop TCP server:', error);
      setMessage('Failed to stop server: ' + error);
    }
  };

  // Stop polling and navigate back home.
const goBack = () => {
    stopPolling();
    if (serverRunning) {
      stopTcpServer();
    }
    navigate('/');
  };

  useEffect(() => {
    // Auto-start TCP server when component mounts
    startTcpServer();

    return () => {
      stopPolling();
      if (serverRunning) {
        stopTcpServer();
      }
    };
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [notification]);

  // Write received image to disk and create database item.
const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!imagePath) {
      setMessage("Please take a picture, upload one from the gallery, or receive one from a phone");
      setNotification("No image selected yet");
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      
      const folderPath = 'found_images';
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

      const newItem: Omit<Item, 'id' | 'created_at'> = {
        name,
        status: "found",
        type,
        location,
        description,
        contact: "",
        solved: false,
        image: imagePath
      };

      const { tag_id } = await addItem(newItem);
      stopPolling();
      if (serverRunning) {
        await stopTcpServer();
      }
      setAddedTagId(tag_id);
    } catch (error) {
      console.error('Error adding item:', error);
      setMessage("Failed to add item: " + error);
      setNotification("Error adding item: " + error);
    } finally {
      setLoading(false);
    }
  };

  if (addedTagId !== null) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6">
        <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
          <h2 className="text-2xl font-bold text-green-800">Found item added successfully</h2>
          <p className="mt-4 text-gray-700">Item tag code:</p>
          <p className="mt-2 rounded bg-white px-4 py-3 font-mono text-2xl font-bold text-gray-900">
            {addedTagId}
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 rounded bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
          >
            Continue to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div className={`px-6 py-3 rounded-lg shadow-lg ${
            (notification.includes("Error") || notification.includes("Failed"))
              ? "bg-red-500 text-white" 
              : "bg-green-500 text-white"
          }`}>
            {notification}
          </div>
        </div>
      )}
      
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Add Found Item</h2>
        <button
          onClick={() => goBack()}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Back
        </button>
      </div>
      
      {message && (
        <div className={`mb-4 p-3 rounded ${
          message.includes('successfully') || message.includes('started') || message.includes('received')
            ? 'bg-green-100 text-green-700' 
            : 'bg-red-100 text-red-700'
        }`}>
          {message}
        </div>
      )}

      {/* TCP Server Status and QR Code */}
      <div className="mb-6 p-4 border border-gray-300 rounded-lg bg-gray-50">
        <h3 className="text-lg font-semibold mb-3">Phone Connection</h3>
        
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-3 h-3 rounded-full ${serverRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
          <span className="text-sm font-medium">
            {serverRunning ? 'Server Running' : 'Server Stopped'}
          </span>
          {phoneConnected && (
            <>
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse ml-3"></div>
              <span className="text-sm font-medium">Phone Connected</span>
            </>
          )}
        </div>

        {qrCodeUrl && (
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">
              Scan this QR code with your phone app:
            </p>
            <img 
              src={qrCodeUrl} 
              alt="Connection QR Code" 
              className="mx-auto border-4 border-white shadow-lg rounded"
            />
            {connectionInfo && (
              <p className="text-xs text-gray-500 mt-2 font-mono">
                {connectionInfo.ip}:{connectionInfo.port}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <button
            onClick={startTcpServer}
            disabled={serverRunning}
            className={`px-4 py-2 rounded font-medium ${
              serverRunning 
                ? 'bg-gray-300 cursor-not-allowed text-gray-500' 
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            Start Server
          </button>
          <button
            onClick={stopTcpServer}
            disabled={!serverRunning}
            className={`px-4 py-2 rounded font-medium ${
              !serverRunning 
                ? 'bg-gray-300 cursor-not-allowed text-gray-500' 
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
          >
            Stop Server
          </button>
        </div>
      </div>

      {/* Image Preview */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Image Preview:</h4>
        <ImageSourcePicker onImageSelected={handleImageSelected} />
        <canvas 
          ref={canvasRef} 
          className="border border-gray-300 rounded max-w-full bg-gray-50"
        ></canvas>
        {!imagePath && serverRunning && (
          <p className="text-sm text-gray-500 mt-2 italic">
            Waiting for image from phone...
          </p>
        )}
        {imagePath && (
          <p className="text-sm text-green-600 mt-2 font-medium">
            ✓ Image received and ready
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Item Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Macbook"
          />
        </div>
      
        <div>
          <label className="block text-sm font-medium mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ItemType)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Phone">Phone</option>
            <option value="Card">Card</option>
            <option value="Cosplay Props">Cosplay Props</option>
            <option value="Wallet">Walllet</option>
            <option value="Bag / Pouch">Bag / Pouch</option>
            <option value="Merch">Merch</option>
            <option value="Glasses">Glasses</option>
            <option value="Miscellaneous">Miscellaneous</option>
            <option value="Test">Test</option>
          </select>
        </div>
      
        <div>
          <label className="block text-sm font-medium mb-1">Hall Location (Found Location, Optional)</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Hall 10 (Docking Hall 6)"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Warna abu-abu, ada sticker, dll."
          />
        </div>
      
        <button
          type="submit"
          disabled={loading || !imagePath}
          className={`w-full py-2 px-4 rounded text-white font-medium ${
            loading || !imagePath
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {loading ? 'Adding...' : imagePath ? 'Add Found Item' : 'Waiting for Image...'}
        </button>
      </form>
    </div>
  );
}

export default AddFoundItemPhone;
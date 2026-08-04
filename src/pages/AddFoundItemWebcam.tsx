import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerItemWithServer } from "../services/database";
import type { Item } from "../types/Item";
import { BaseDirectory, exists, mkdir, writeFile } from '@tauri-apps/plugin-fs';

type ItemType = "Phone" | "Card" | "Cosplay Props" | "Wallet" | "Bag / Pouch" | "Merch" | "Miscellaneous";

function AddFoundItemWebcam() {
  const navigate = useNavigate();
  const [name, setName] = useState<string>("");
  const [type, setType] = useState<ItemType>("Phone");
  const [location, setLocation] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [imagePath, setImagePath] = useState<string>("");
  const [imageBlob, setImageBlob] = useState<Uint8Array>(new Uint8Array());

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);

  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [notification, setNotification] = useState<string | null>(null);

  // New: holds the registered item code returned from the server
  const [itemCode, setItemCode] = useState<string | null>(null);

  const startCamera = async (deviceId?: string) => {
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: "environment" },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setMessage("");
    } catch (err) {
      console.error("Camera error:", err);
      setMessage("Failed to access camera");
    }
  };

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

    const fileName = `found_${Date.now()}.jpg`;
    const folderPath = 'found_images';
    const fullPath = `${folderPath}/${fileName}`;
    setImagePath(fullPath);
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach(track => {
        if (track.readyState === 'live') track.stop();
      });
      videoRef.current!.srcObject = null;
    }
  };

  const goBack = () => {
    stopCamera();
    navigate('/');
  };

  useEffect(() => {
    const loadDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });

        const deviceList = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = deviceList.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);

        const defaultDevice = videoDevices.find(d => d.label.toLowerCase().includes('environment'))
          || videoDevices[0];
        if (defaultDevice) {
          setSelectedDeviceId(defaultDevice.deviceId);
          startCamera(defaultDevice.deviceId);
        }
      } catch (err) {
        console.error("Error loading devices:", err);
        setMessage("Camera access denied or unavailable");
      }
    };

    loadDevices();

    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      setMessage("");

      // Save captured image to local AppData folder
      if (imagePath !== "") {
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
      }

      const newItem: Omit<Item, 'id' | 'created_at'> = {
        name,
        status: "found",
        type,
        location,
        description,
        contact: "",
        solved: false,
        image: imagePath,
      };

      // POST to server, get unique code back, and save locally
      const code = await registerItemWithServer(
        newItem,
        imageBlob.length > 0 ? imageBlob : undefined,
        imagePath || undefined
      );

      stopCamera();
      setItemCode(code);

    } catch (error) {
      console.error('Error adding item:', error);
      setMessage("Failed to add item: " + error);
      setNotification("Error adding item: " + error);
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen: show item code prominently ──────────────────────────────
  if (itemCode) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full bg-green-50 border-2 border-green-400 rounded-2xl p-8 text-center shadow-md">
          <div className="text-green-500 text-5xl mb-4">✅</div>
          <h2 className="text-xl font-semibold text-green-700 mb-1">Item Registered!</h2>
          <p className="text-gray-500 text-sm mb-6">Write this code on the item label</p>

          <div className="bg-white border-2 border-green-300 rounded-xl px-8 py-5 inline-block mb-6">
            <span className="text-4xl font-mono font-bold tracking-[0.2em] text-green-800">
              {itemCode}
            </span>
          </div>

          <p className="text-xs text-gray-400 mb-8">
            Code format: <span className="font-mono">[Status]-[Type]-[Sequence]</span>
          </p>

          <button
            onClick={() => navigate('/')}
            className="px-8 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium text-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div className={`px-6 py-3 rounded-lg shadow-lg ${
            notification.includes("Error")
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
          onClick={goBack}
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

      {devices.length > 1 && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Camera</label>
          <select
            value={selectedDeviceId || ''}
            onChange={(e) => {
              const deviceId = e.target.value || undefined;
              setSelectedDeviceId(deviceId);
              stopCamera();
              if (deviceId) startCamera(deviceId);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${devices.indexOf(device) + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer mb-2"
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
          placeholder="e.g. Macbook"
        />

        <label className="block text-sm font-medium mb-1">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ItemType)}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="Phone">Phone</option>
          <option value="Card">Card</option>
          <option value="Cosplay Props">Cosplay Props</option>
          <option value="Wallet">Wallet</option>
          <option value="Bag / Pouch">Bag / Pouch</option>
          <option value="Merch">Merch</option>
          <option value="Miscellaneous">Miscellaneous</option>
        </select>

        <label className="block text-sm font-medium mb-1">Hall Location (Found Location, Optional)</label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. Hall 10 (Docking Hall 6)"
        />

        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. Warna abu-abu, ada sticker, dll."
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
          {loading ? 'Registering...' : 'Add Found Item'}
        </button>
      </form>
    </div>
  );
}

export default AddFoundItemWebcam;
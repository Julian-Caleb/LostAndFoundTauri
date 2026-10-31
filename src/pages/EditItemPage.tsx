import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Item } from "../types/Item";
import { BaseDirectory, exists, mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { deleteLocalImage, deleteRemoteImage, getItemById, updateItem } from "../services/database";

function EditItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<Item | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedImageBytes, setSelectedImageBytes] = useState<Uint8Array | null>(null);
  const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const loadItem = async () => {
      if (!id) return;
      const foundItem = await getItemById(id);
      if (foundItem) {
        setItem(foundItem);
        setSelectedImageBytes(null);
        setSelectedImagePath(null);
      }
    };

    loadItem();
  }, [id]);

  useEffect(() => {
    if (!item?.image) {
      setImagePreview(null);
      return;
    }

    let isMounted = true;

    const loadImagePreview = async () => {
      try {
        const fileData = await readFile(item.image!, { baseDir: BaseDirectory.AppData });
        const blob = new Blob([fileData], { type: 'image/jpeg' });
        if (isMounted) setImagePreview(URL.createObjectURL(blob));
      } catch {
        if (isMounted) setImagePreview(null);
      }
    };

    loadImagePreview();

    return () => {
      isMounted = false;
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [item?.image]);

  useEffect(() => {
    if (cameraOpen && videoRef.current && cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current;
    }
  }, [cameraOpen]);

  useEffect(() => () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [notification]);

  const useImage = async (image: Blob, fileName: string) => {
    if (!item) return;

    const bytes = new Uint8Array(await image.arrayBuffer());
    const folderName = item.status === 'lost' ? 'lost_images' : 'found_images';
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetPath = item.image && !item.image.startsWith('http')
      ? item.image
      : `${folderName}/${Date.now()}_${safeFileName}`;

    setSelectedImageBytes(bytes);
    setSelectedImagePath(targetPath);

    const previewUrl = URL.createObjectURL(image);
    setImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return previewUrl;
    });
  };

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      await useImage(file, file.name);
      setCameraError(null);
    } catch (error) {
      console.error('Could not load selected image:', error);
      setNotification('Error loading selected image');
    }
  };

  const openCamera = async () => {
    try {
      cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      setCameraError(null);
      setCameraOpen(true);
    } catch (error) {
      console.error('Could not open camera:', error);
      setCameraError('Could not access the camera. Check camera permissions and try again.');
    }
  };

  const closeCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraOpen(false);
  };

  const captureImage = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('Could not capture an image from the camera.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9)
    );
    if (!image) {
      setCameraError('Could not capture an image from the camera.');
      return;
    }

    try {
      await useImage(image, `item_${Date.now()}.jpg`);
      closeCamera();
      setCameraError(null);
    } catch (error) {
      console.error('Could not use captured image:', error);
      setCameraError('Could not use the captured image.');
    }
  };

  const handleRemoveImage = async () => {
    if (!item?.image) return;

    const confirmed = window.confirm('Remove this item image?');
    if (!confirmed) return;

    await deleteLocalImage(item.image);
    await deleteRemoteImage(item.image);

    setItem({ ...item, image: undefined });
    setSelectedImageBytes(null);
    setSelectedImagePath(null);
    setImagePreview(null);
  };

  const handleSave = async () => {
    if (!item) return;

    const previousImagePath = item.image;
    let nextImagePath = item.image;

    try {
      if (selectedImageBytes && selectedImagePath) {
        const targetPath = selectedImagePath.replace(/\\/g, '/');
        const directory = targetPath.substring(0, targetPath.lastIndexOf('/'));

        if (directory) {
          const folderExists = await exists(directory, { baseDir: BaseDirectory.AppData }).catch(() => false);
          if (!folderExists) {
            await mkdir(directory, { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {});
          }
        }

        await writeFile(targetPath, selectedImageBytes, { baseDir: BaseDirectory.AppData });
        nextImagePath = targetPath;

        if (previousImagePath && previousImagePath !== targetPath) {
          if (!previousImagePath.startsWith('http')) {
            await deleteLocalImage(previousImagePath);
          } else {
            await deleteRemoteImage(previousImagePath);
          }
        }
      }

      await updateItem({ ...item, image: nextImagePath });
      setNotification('Item updated successfully!');
      setTimeout(() => {
        navigate(-1);
      }, 1500);
    } catch (error) {
      console.error('Error saving item:', error);
      setNotification('Error updating item');
    }
  };

  if (!item) return <div className="p-6 text-center text-gray-500">Loading item...</div>;

  return (
    <div className="p-8 max-w-lg mx-auto">
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div className={`px-6 py-3 rounded-lg shadow-lg ${
            notification.includes('Error')
              ? 'bg-red-500 text-white'
              : 'bg-green-500 text-white'
          }`}>
            {notification}
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold mb-6 text-center">Edit Item</h1>

      <div className="mb-6">
        <label className="block mb-2 font-semibold">Item Image</label>

        {imagePreview && (
          <div className="mb-3 flex flex-col items-center gap-3">
            <img src={imagePreview} alt={item.name || 'Item'} className="w-48 h-48 object-cover rounded border" />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-500 text-sm">
            {imagePreview ? 'Choose from gallery' : 'Upload from gallery'}
            <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          </label>
          <button
            type="button"
            onClick={openCamera}
            className="bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm"
          >
            Take a picture
          </button>
          {item.image && (
            <button
              type="button"
              onClick={handleRemoveImage}
              className="bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm"
            >
              Remove image
            </button>
          )}
        </div>
        {cameraError && <p className="mt-2 text-sm text-red-600">{cameraError}</p>}
      </div>

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-4 shadow-xl">
            <h2 className="mb-3 text-lg font-semibold">Take an item picture</h2>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="max-h-[65vh] w-full rounded bg-black object-contain"
              style={{ transform: 'scaleX(-1)' }}
            />
            <canvas ref={canvasRef} className="hidden" />
            {cameraError && <p className="mt-2 text-sm text-red-600">{cameraError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCamera}
                className="rounded bg-gray-400 px-4 py-2 text-white hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={captureImage}
                className="rounded bg-blue-700 px-4 py-2 text-white hover:bg-blue-500"
              >
                Capture
              </button>
            </div>
          </div>
        </div>
      )}

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
        onChange={(e) => setItem({ ...item, type: e.target.value as Item['type'] })}
        className="border p-2 w-full mb-4 rounded"
      >
        <option value="Phone">Phone</option>
        <option value="Card">Card</option>
        <option value="Cosplay Props">Cosplay Props</option>
        <option value="Wallet">Wallet</option>
        <option value="Bag / Pouch">Bag / Pouch</option>
        <option value="Merch">Merch</option>
        <option value="Miscellaneous">Miscellaneous</option>
        <option value="Test">Test</option>
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

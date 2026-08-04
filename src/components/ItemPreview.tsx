import { useEffect, useState } from "react";
import { Item } from "../types/Item";
import { BaseDirectory, mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { updateItemSolvedStatus } from "../services/database";
import { useNavigate } from "react-router-dom";
import { VPS_URL } from "../services/database";

interface ItemPreviewProps {
  item: Item;
}

function ItemPreview({ item }: ItemPreviewProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [solved, setSolved] = useState(item.solved); 
  const [imgSrc, setImgSrc] = useState<string | undefined>(undefined);
  const [notification, setNotification] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadImage = async (path: string) => {
    if (path.startsWith('http')) {
      try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Server responded with ${response.status}`);
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      } catch (err) {
        console.error("Error fetching remote image:", err);
        return undefined;
      }
    }

    try {
      const fileData = await readFile(path, { baseDir: BaseDirectory.AppData });
      const blob = new Blob([fileData], { type: "image/jpeg" });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error("Error reading file locally:", err);

      try {
        const response = await fetch(`${VPS_URL}/download-image?imagePath=${encodeURIComponent(path)}`);
        if (!response.ok) throw new Error(`Server responded with ${response.status}`);

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        const dir = path.substring(0, path.lastIndexOf('/'));
        if (dir) {
          try {
            await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
          } catch (mkdirErr) {
            // Directory may already exist
          }
        }

        await writeFile(path, uint8Array, { baseDir: BaseDirectory.AppData });
        console.log(`✅ Image downloaded and saved to AppData: ${path}`);

        return URL.createObjectURL(blob);
      } catch (downloadErr) {
        console.error("Error downloading image from server:", downloadErr);
        return undefined;
      }
    }
  };

  useEffect(() => {
    if (item.image) {
      loadImage(item.image).then(setImgSrc);
    }
  }, [item.image]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleSolvedChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSolved = e.target.checked;

    const action = newSolved ? "mark this item as solved" : "mark this item as unsolved";
    const confirmed = window.confirm(`Are you sure you want to ${action}?`);

    if (!confirmed) {
      e.target.checked = !newSolved;
      return;
    }

    setSolved(newSolved);

    try {
      await updateItemSolvedStatus(item.id, newSolved);

      await fetch(`${VPS_URL}/update-solved/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ solved: newSolved }),
      });

      setNotification(newSolved ? "Item marked as solved!" : "Item marked as unsolved!");
    } catch (err) {
      console.error("Error updating solved status:", err);
      setNotification("Error updating status");
      setSolved(!newSolved);
      e.target.checked = !newSolved;
    }
  };

  return (
    <>
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div className={`px-6 py-3 rounded-lg shadow-lg ${
            (notification.includes("Error") || !solved)
              ? "bg-red-500 text-white" 
              : "bg-green-500 text-white"
          }`}>
            {notification}
          </div>
        </div>
      )}
      
      <tr className="py-4">
        <td className="border border-gray-300 px-4 py-2 text-center">
          {item.item_code
            ? <span className="font-mono font-semibold tracking-wider text-blue-800">{item.item_code}</span>
            : <span className="text-gray-400 text-xs">—</span>
          }
        </td>
        <td className="border border-gray-300 px-4 py-2 text-left">{item.name}</td>
        <td className="border border-gray-300 px-4 py-2 text-left">{item.type}</td>
        <td className="border border-gray-300 px-4 py-2 text-left">{item.location}</td>
        <td className="border border-gray-300 px-4 py-2 text-left">{item.contact}</td>
        <td className="border border-gray-300 px-4 py-2 text-left">{item.description}</td>
        <td className="border border-gray-300 px-4 py-2 text-center">
          <label className="flex items-center justify-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={item.solved || solved}
              onChange={handleSolvedChange}
              className="w-4 h-4"
            />
          </label>
        </td>
        <td className="border border-gray-300 px-4 py-2 text-left">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="px-3 py-1 bg-blue-800 text-white rounded hover:bg-blue-400 text-sm"
          >
            {showDetails ? "Hide" : "Show"}
          </button>
        </td>
      </tr>

      <tr>
        <td colSpan={8}>
          {showDetails && (
            <div className="flex py-4 justify-evenly">
              {item.image && (
                <img
                  src={imgSrc}
                  alt={item.name}
                  className="w-1/4 h-full object-contain"
                />
              )}
              <div>
                {item.item_code && (
                  <p className="px-4 py-2 text-left">
                    <span className="font-bold">Code:</span>{" "}
                    <span className="font-mono font-semibold tracking-wider text-blue-800">
                      {item.item_code}
                    </span>
                  </p>
                )}
                <p className="px-4 py-2 text-left"><span className="font-bold">Name:</span> {item.name}</p>
                <p className="px-4 py-2 text-left"><span className="font-bold">Type:</span> {item.type}</p>
                <p className="px-4 py-2 text-left"><span className="font-bold">Last known location:</span> {item.location}</p>
                <p className="px-4 py-2 text-left"><span className="font-bold">Contact:</span> {item.contact}</p>
                <p className="px-4 py-2 text-left"><span className="font-bold">Description:</span> {item.description}</p>
                <button
                  onClick={() => navigate(`/edit/${item.id}`)}
                  className="mt-4 px-4 py-2 bg-blue-800 text-white rounded hover:bg-blue-400 text-sm"
                >
                  Edit
                </button>
              </div>
            </div>
          )}
        </td>
      </tr>
    </>
  );
}

export default ItemPreview;
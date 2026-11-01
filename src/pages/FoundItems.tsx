import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ItemPreview from "../components/ItemPreview";
import { getFoundItems } from "../services/database";
import type { Item } from "../types/Item";

// Display paginated list of found items.
function FoundItems() {
  const navigate = useNavigate();
  const [foundItems, setFoundItems] = useState<Item[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const itemsPerPage = 10;
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadItems();
  }, []);

  // Fetch found items from local database.
const loadItems = async () => {
    try {
      setLoading(true);
      const items = await getFoundItems();
      console.log('Loaded found items:', items);
      setFoundItems(items);
    } catch (error) {
      console.error('Failed to load items:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = foundItems
  .filter((item) => {
    const term = searchTerm.toLowerCase();
    return (
      item.name.toLowerCase().includes(term) ||
      item.tag_id?.toLowerCase().includes(term) ||
      item.type.toLowerCase().includes(term) ||
      item.location.toLowerCase().includes(term) ||
      item.contact.toLowerCase().includes(term) ||
      item.description.toLowerCase().includes(term)
    );
  })
  .sort((a, b) => {
    if (a.solved === b.solved) return 0;
    return a.solved ? 1 : -1;
  });

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);
  
  // Navigate to specified pagination page.
const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="w-full h-full m-0">
      <div className="flex justify-between items-center mb-4 px-4">
        <h2 className="text-xl font-bold">Found Items</h2>
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/add-found-item-webcam')}
            className="px-4 py-2 bg-blue-800 text-white rounded hover:bg-blue-400"
          >
            Add Found Item (Webcam)
          </button>
          <button
            onClick={() => navigate('/add-found-item-phone')}
            className="px-4 py-2 bg-blue-800 text-white rounded hover:bg-blue-400"
          >
            Add Found Item (Phone)
          </button>
        </div>
      </div>

      <div className="px-4 mb-4">
        <input
          type="text"
          placeholder="Search by name, tag ID, type, or location..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {foundItems.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No found items yet. Click "Add Found Item" to add one.
        </div>
      ) : (
        <>
          <table className="mt-2 min-w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-2 text-center">Name</th>
                <th className="border border-gray-300 px-4 py-2 text-center">Tag ID</th>
                <th className="border border-gray-300 px-4 py-2 text-center">Type</th>
                <th className="border border-gray-300 px-4 py-2 text-center">Location</th>
                <th className="border border-gray-300 px-4 py-2 text-center">Contact</th>
                <th className="border border-gray-300 px-4 py-2 text-center">Description</th>
                <th className="border border-gray-300 px-4 py-2 text-center">Solved</th>
                <th className="border border-gray-300 px-4 py-2 text-center">Check Details</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.map((item, index) => (
                <ItemPreview key={startIndex + index} item={item} showTagId />
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex justify-center items-center mt-4 space-x-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded ${
                  currentPage === 1
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                Prev
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={`px-3 py-1 rounded ${
                    currentPage === page
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded ${
                  currentPage === totalPages
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default FoundItems;
import { useState } from "react";
import LostItems from "./LostItems";
import FoundItems from "./FoundItems";
import { resetLocalData } from "../services/database";

function Homepage() {
  const [activeView, setActiveView] = useState<"lost" | "found">('lost');
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    const confirmed = window.confirm(
      'This will delete all local data and sync history. Are you sure?'
    );
    if (!confirmed) return;

    setResetting(true);
    try {
      await resetLocalData();
      window.location.reload();
    } catch (err) {
      console.error('Reset failed:', err);
      alert('Reset failed. Check the console for details.');
      setResetting(false);
    }
  }

  return (
    <>
      <section className="w-full h-16 mb-2 flex justify-evenly items-center">
        <button
          className={`text-xl w-full h-full ${activeView === 'lost' ? 'bg-blue-500' : 'bg-blue-800 cursor-pointer hover:bg-blue-400'} text-white`}
          onClick={() => setActiveView("lost")}
        >
          Lost Items
        </button>
        <button
          className={`text-xl w-full h-full ${activeView === 'found' ? 'bg-blue-500' : 'bg-blue-800 cursor-pointer hover:bg-blue-400'} text-white`}
          onClick={() => setActiveView("found")}
        >
          Found Items
        </button>
        <button
          className="text-sm w-auto px-4 h-full bg-red-700 cursor-pointer hover:bg-red-500 text-white whitespace-nowrap disabled:opacity-50"
          onClick={handleReset}
          disabled={resetting}
        >
          {resetting ? 'Resetting…' : 'Reset Local Data'}
        </button>
      </section>
      {activeView === "lost" && <LostItems />}
      {activeView === "found" && <FoundItems />}
    </>
  );
}

export default Homepage;
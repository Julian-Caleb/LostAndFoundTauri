import { useState } from "react";
import LostItems from "./LostItems";
import FoundItems from "./FoundItems";

function Homepage() {
  const [activeView, setActiveView] = useState<"lost" | "found">('lost');

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
      </section>
      {activeView === "lost" && <LostItems />}
      {activeView === "found" && <FoundItems />}
    </>
  );
}

export default Homepage;
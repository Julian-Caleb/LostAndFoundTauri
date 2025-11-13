import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import "./App.css";
import Homepage from './pages/Homepage';
import AddLostItem from './pages/AddLostItem';
import EditItemPage from './pages/EditItemPage';
import { startAutoSync } from './services/database';
import AddFoundItemWebcam from './pages/AddFoundItemWebcam';
import AddFoundItemPhone from './pages/AddFoundItemPhone';

function AppContent() {
  useEffect(() => {
    startAutoSync();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
      <Route path="/add-found-item-webcam" element={<AddFoundItemWebcam />} />
      <Route path="/add-found-item-phone" element={<AddFoundItemPhone />} />
      <Route path="/add-lost-item" element={<AddLostItem />} />
      <Route path="/edit/:id" element={<EditItemPage />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
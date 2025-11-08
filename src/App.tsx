import { BrowserRouter, Routes, Route } from 'react-router-dom';
import "./App.css";
import AddFoundItem from './pages/AddFoundItem';
import Homepage from './pages/Homepage';
import AddLostItem from './pages/AddLostItem';
import EditItemPage from './pages/EditItemPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/add-found-item" element={<AddFoundItem />} />
        <Route path="/add-lost-item" element={<AddLostItem />} />
        <Route path="/edit/:id" element={<EditItemPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
import { Analytics } from "@vercel/analytics/react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import CategoryDetailPage from "./pages/CategoryDetailPage";

export default function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/category/:slug" element={<CategoryDetailPage />} />
        </Routes>
      </BrowserRouter>
      <Analytics />
    </>
  );
}

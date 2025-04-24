import "./styles/globals.css";
import { useEffect } from "react";
import Home from "./pages/Home";

export default function App() {

  useEffect(() => {
    const handleMessage = (e) => {
      try {
        const { action, data } = JSON.parse(e.data);
        if (action === "RENDER_PACKING") {
          console.log("메시지 파싱 성공", data);
        }
      } catch (err) {
        console.error("메시지 파싱 실패", err);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return <Home />;
}
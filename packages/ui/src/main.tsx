import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startConnection } from "./connection";
import "./styles.css";

startConnection();
createRoot(document.getElementById("root")!).render(<App />);

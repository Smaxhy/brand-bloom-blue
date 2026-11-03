import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import "../src/styles.css";
import { AdminApp } from "../src/admin/AdminApp";
createRoot(document.getElementById("root")!).render(<><AdminApp /><Toaster /></>);

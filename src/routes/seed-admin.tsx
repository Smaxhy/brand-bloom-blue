import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { seedAdminUser } from "@/lib/seed-admin.functions";

export const Route = createFileRoute("/seed-admin")({
  component: SeedAdmin,
});

function SeedAdmin() {
  const [status, setStatus] = useState("Click to seed admin user");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setStatus("Running...");
    try {
      const res = await seedAdminUser();
      setStatus("Success: " + JSON.stringify(res));
    } catch (e: any) {
      setStatus("Error: " + (e?.message ?? String(e)));
    }
    setRunning(false);
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Seed Admin User</h1>
      <p>Creates inspirovamanagement@inspirova.local with password Kakapuma08 and grants admin role.</p>
      <button onClick={run} disabled={running} style={{ padding: "10px 20px", fontSize: 16 }}>
        Run
      </button>
      <pre style={{ marginTop: 20, padding: 12, background: "#f3f4f6", whiteSpace: "pre-wrap" }}>{status}</pre>
    </div>
  );
}

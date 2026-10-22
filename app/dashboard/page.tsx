import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";
import SubHeader from "@/components/SubHeader";

export const metadata: Metadata = {
  title: "Pickups · Almost",
  description: "Which products shoppers pick up, hold, compare and put back, joined with your POS sales.",
};

export default function DashboardPage() {
  return (
    <main className="flex-1">
      <SubHeader active="/dashboard" />
      <Dashboard />
    </main>
  );
}

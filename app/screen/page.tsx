import type { Metadata } from "next";
import { Suspense } from "react";
import Screen from "@/components/Screen";

export const metadata: Metadata = {
  title: "Screen · Almost",
  description: "A screen beside the rack that shows the product a shopper is holding.",
};

export default function ScreenPage() {
  return (
    // The screen reads its zone from the address, which is only known in the browser.
    <Suspense>
      <Screen />
    </Suspense>
  );
}

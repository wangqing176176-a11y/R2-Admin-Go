import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "R2 Admin Go 文件分享",
};

export default function ShareLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

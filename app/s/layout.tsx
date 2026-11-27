import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "QingDock-统一云存储与文件协作平台 | 文件分享",
};

export default function ShareLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

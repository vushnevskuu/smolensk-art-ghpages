import type { Metadata } from "next";
import { EditorialAdminDashboard } from "@/components/admin/editorial-admin-dashboard";

export const metadata: Metadata = {
  title: "Админка - Смоленск Арт",
  description: "Публикация материалов на сайте Смоленск Арт",
};

export default function AdminPage() {
  return <EditorialAdminDashboard />;
}

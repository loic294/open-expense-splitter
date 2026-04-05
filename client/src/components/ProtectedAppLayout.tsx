import { AppDataProvider } from "../context/AppDataContext";
import AppShell from "./AppShell";

export default function ProtectedAppLayout() {
  return (
    <AppDataProvider>
      <AppShell />
    </AppDataProvider>
  );
}

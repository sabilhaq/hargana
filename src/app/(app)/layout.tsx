import { CoreProvider } from "./core-provider";
import { SyncProvider } from "./sync";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <CoreProvider>
      <SyncProvider>{children}</SyncProvider>
    </CoreProvider>
  );
}

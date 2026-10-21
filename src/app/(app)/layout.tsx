import { CoreProvider } from "./core-provider";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <CoreProvider>{children}</CoreProvider>;
}

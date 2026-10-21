import { CoreProvider } from "./core-provider";
import { HomeScreen } from "./home-screen";

export default function Home() {
  return (
    <CoreProvider>
      <HomeScreen />
    </CoreProvider>
  );
}

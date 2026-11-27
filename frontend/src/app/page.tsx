import { MainNavigation } from "@/components/MainNavigation";
import { FocusSessionProvider } from "@/components/study/FocusSessionProvider";

export default function HomePage() {
  return <FocusSessionProvider><MainNavigation /></FocusSessionProvider>;
}

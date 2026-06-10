import { CoachWorkspace } from "@/components/coach-workspace";
import { getDefaultLearnerCase } from "@/lib/deliberation/mock";

export default function Home() {
  return <CoachWorkspace initialCase={getDefaultLearnerCase()} />;
}

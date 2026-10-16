import { redirect } from "next/navigation";

import { LoginScreen } from "@/core/auth/components/login-screen";
import { getSessionRole } from "@/core/auth/session";

export const dynamic = "force-dynamic";

export default async function EntrancePage() {
  if (await getSessionRole()) {
    redirect("/home");
  }

  return <LoginScreen />;
}

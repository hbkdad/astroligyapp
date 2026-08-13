"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import type { ProtectedNatalChartActionState } from "@/presentation/protected-natal-chart-state";
import { productionBetterAuthHttpService } from "@/server/better-auth-http-service";
import { generateProtectedNatalChartFromForm } from "@/server/protected-natal-chart-action";

export async function generateProtectedNatalChartAction(
  _previousState: ProtectedNatalChartActionState,
  formData: FormData,
): Promise<ProtectedNatalChartActionState> {
  const result = await generateProtectedNatalChartFromForm(
    await headers(),
    formData,
    productionBetterAuthHttpService,
  );
  if (result.disposition === "generated" || result.disposition === "cached")
    revalidatePath("/account/profiles");
  return result;
}

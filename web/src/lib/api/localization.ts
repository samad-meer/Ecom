import { apiFetch } from "./client";

export interface LanguageAccessSetting {
  /** Master switch. False = the app is English-only for everyone. */
  urdu_enabled: boolean;
  allowed_user_types: string[];
}

export const localizationApi = {
  getLanguageAccess(): Promise<LanguageAccessSetting> {
    return apiFetch("/localization/language-access/", { auth: true });
  },
  updateLanguageAccess(
    patch: Partial<Pick<LanguageAccessSetting, "urdu_enabled" | "allowed_user_types">>,
  ): Promise<LanguageAccessSetting> {
    return apiFetch("/localization/language-access/", {
      method: "PATCH",
      auth: true,
      body: patch,
    });
  },
};

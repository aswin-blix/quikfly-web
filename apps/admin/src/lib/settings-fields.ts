// How each business setting appears on the Settings page. Add a row when a key is added
// to `Settings` in @quikfly/shared (the API validates the type; this decides the form).
import type { Settings } from "@quikfly/shared";

export interface SettingField {
  key: keyof Settings;
  label: string;
  help: string;
  type: "toggle" | "number" | "text";
  /** Shown after number inputs, e.g. "₹" or "%". */
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface SettingGroup {
  title: string;
  sub: string;
  fields: SettingField[];
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    title: "Licence checks",
    sub: "Self-drive customers submit a driving licence before pickup.",
    fields: [
      {
        key: "licenceAutoApprove", type: "toggle", label: "Approve licences automatically",
        help: "Off: every licence waits in Licence reviews for a person to approve it. On: licences are verified the moment they're submitted (useful for demos nobody is watching).",
      },
    ],
  },
];

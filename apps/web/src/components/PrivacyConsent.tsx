"use client";
// Asks a signed-in person to agree to the privacy notice when they haven't agreed to the
// current version (new accounts, and everyone after PRIVACY_NOTICE.version changes). DPDP:
// consent is a clear yes after a plain notice; saying no signs them out (their account and
// bookings stay; deleting it is in Account → Login & security).
import { ShieldCheck } from "lucide-react";
import { PRIVACY_NOTICE, privacyNotice } from "@quikfly/shared";
import { api } from "@/lib/api";
import { Link, usePath } from "@/lib/nav";
import { useApp } from "./AppProvider";
import { useSettings } from "./ConfigProvider";
import { useT } from "./LanguageProvider";
import { ErrorText, useAction } from "./account/kit";
import { GoldButton, Modal } from "./ui";

export function PrivacyConsent() {
  const { user, setUser, signOut, loginOpen } = useApp();
  const settings = useSettings();
  const path = usePath();
  const t = useT();
  const { run, busy, error } = useAction();
  // Waits for sign-up to finish, and steps aside on /privacy so the full notice can be read.
  const open = !!user && user.privacyConsent !== PRIVACY_NOTICE.version && !loginOpen && path !== "/privacy";
  if (!open) return null;
  const agree = () => run(async () => setUser(await api.account.consent(PRIVACY_NOTICE.version)));

  return (
    <Modal open title={t("privacyTitle")}>
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-strong font-medium"><ShieldCheck size={18} className="text-gold shrink-0" />{t("privacyBefore")}</p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-soft">{privacyNotice(settings).summary.map((p) => <li key={p}>{p}</li>)}</ul>
        <p className="text-sm text-muted"><Link href="/privacy" className="text-gold">{t("privacyReadFull")}</Link>. {t("privacyReadFullWhy")}</p>
        <ErrorText>{error}</ErrorText>
        <GoldButton className="w-full" loading={busy} onClick={agree}>{t("privacyAgree")}</GoldButton>
        <button type="button" className="w-full text-sm text-muted py-1" onClick={() => signOut()}>{t("privacyDecline")}</button>
      </div>
    </Modal>
  );
}

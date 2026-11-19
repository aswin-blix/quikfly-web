"use client";
// Account → Privacy & data: the DPDP rights in one place: see the notice and when you agreed,
// download everything QuikFly holds (GET /me/export), and where to correct or erase it.
import { Download, FileText, Mail, Trash2 } from "lucide-react";
import { DELETION_GRACE_DAYS, privacyContact } from "@quikfly/shared";
import { api } from "@/lib/api";
import { longDate } from "@/lib/format";
import { Link, qs } from "@/lib/nav";
import { useApp } from "../AppProvider";
import { useSettings } from "../ConfigProvider";
import { useLang } from "../LanguageProvider";
import { GoldButton } from "../ui";
import { ErrorText, Section, useAction } from "./kit";

/** Saves a JSON value as a file through a temporary link (nothing leaves the browser). */
function saveJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PrivacySection() {
  const { user, toast } = useApp();
  const contact = privacyContact(useSettings());
  const { run, busy, error } = useAction();
  const { t, locale } = useLang();
  if (!user) return null;
  const download = () => run(async () => {
    const data = await api.account.exportData();
    saveJson(`quikfly-data-${data.exportedAt.slice(0, 10)}.json`, data);
    toast(t("privacyDownloading"));
  });

  return (
    <Section title={t("sectionPrivacy")} sub={t("privacyRightsSub")}>
      <div className="space-y-6 divide-y divide-line [&>*:not(:first-child)]:pt-6">
        <div>
          <p className="font-medium text-strong flex items-center gap-2"><FileText size={17} className="text-gold" />{t("linkPrivacyNotice")}</p>
          <p className="text-sm text-muted mt-1">
            {user.privacyConsent ? t("privacyAgreedOn", { date: longDate(user.privacyConsent, locale) }) : t("privacyNotAgreed")}{" "}
            <Link href="/privacy" className="text-gold">{t("privacyReadIt")}</Link>
          </p>
        </div>
        <div>
          <p className="font-medium text-strong flex items-center gap-2"><Download size={17} className="text-gold" />{t("privacyDownloadTitle")}</p>
          <p className="text-sm text-muted mt-1">{t("privacyDownloadSub")}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <GoldButton loading={busy} onClick={download}><Download size={16} />{t("privacyDownloadButton")}</GoldButton>
            <ErrorText>{error}</ErrorText>
          </div>
        </div>
        <div>
          <p className="font-medium text-strong flex items-center gap-2"><Trash2 size={17} className="text-gold" />{t("privacyEraseTitle")}</p>
          <p className="text-sm text-muted mt-1">{t("privacyEraseSub", { days: DELETION_GRACE_DAYS })}</p>
          <p className="text-sm mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Link href={`/account${qs({ tab: "profile" })}`} className="text-gold">{t("accountEditProfile")}</Link>
            <Link href={`/account${qs({ tab: "security" })}`} className="text-gold">{t("privacyDeleteAccount")}</Link>
          </p>
        </div>
        <div>
          <p className="font-medium text-strong flex items-center gap-2"><Mail size={17} className="text-gold" />{t("privacyQuestionsTitle")}</p>
          <p className="text-sm text-muted mt-1 break-words">{t("privacyQuestionsSub", { name: contact.name, email: contact.email, phone: contact.phone })}</p>
          <a className="text-sm text-gold break-all" href={`mailto:${contact.email}`}>{contact.email}</a>
        </div>
      </div>
    </Section>
  );
}

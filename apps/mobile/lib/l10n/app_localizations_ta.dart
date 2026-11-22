// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Tamil (`ta`).
class LTa extends L {
  LTa([String locale = 'ta']) : super(locale);

  @override
  String get langName => 'தமிழ்';

  @override
  String get langMenu => 'மொழி';

  @override
  String get langNote =>
      'தமிழும் இந்தியும் புதியவை. ஏதேனும் தவறாகத் தெரிந்தால் எங்களிடம் சொல்லுங்கள்.';

  @override
  String get navHome => 'முகப்பு';

  @override
  String get navServices => 'சேவைகள்';

  @override
  String get navOffers => 'சலுகைகள்';

  @override
  String get navMyTrips => 'பயணங்கள்';

  @override
  String get navAccount => 'கணக்கு';

  @override
  String get navLogin => 'உள்நுழை';

  @override
  String get navHelp => 'உதவி';

  @override
  String get navNotifications => 'அறிவிப்புகள்';

  @override
  String navNotificationsUnread(Object count) {
    return 'அறிவிப்புகள், $count படிக்கப்படாதவை';
  }

  @override
  String get navAllServices => 'அனைத்து சேவைகள்';

  @override
  String get navWallet => 'வாலட்';

  @override
  String get navMyAccount => 'என் கணக்கு';

  @override
  String navUpcoming(Object count) {
    return '$count வரவிருக்கும்';
  }

  @override
  String get navLogoHome => 'QuikFly முகப்பு';

  @override
  String get bannerDemo => 'டெமோ முறை · மாதிரித் தரவு';

  @override
  String get bannerPreview => 'முன்னோட்டம்';

  @override
  String get bannerOtp => 'உள்நுழைவு OTP';

  @override
  String get serviceBikeTitle => 'பைக்';

  @override
  String get serviceBikeAction => 'பைக் டாக்ஸி';

  @override
  String get serviceBikeNav => 'பைக் டாக்ஸி';

  @override
  String get serviceBikeTagline => 'நெரிசலைத் தவிருங்கள்';

  @override
  String get serviceBikeBlurb =>
      'பைக், இ-பைக், ஆட்டோ 5 நிமிடங்களுக்குள் உங்கள் வாசலில்.';

  @override
  String get serviceCarTitle => 'கார்';

  @override
  String get serviceCarAction => 'கார் சவாரி';

  @override
  String get serviceCarNav => 'கேப்';

  @override
  String get serviceCarTagline => 'வசதியாகப் பயணியுங்கள்';

  @override
  String get serviceCarBlurb =>
      'மினி, செடான், SUV அல்லது பிரைம்: முன்பே தெரியும் கட்டணம், சரிபார்க்கப்பட்ட ஓட்டுநர்கள்.';

  @override
  String get serviceBusTitle => 'பேருந்து பயணம்';

  @override
  String get serviceBusAction => 'பேருந்து முன்பதிவு';

  @override
  String get serviceBusNav => 'பேருந்து';

  @override
  String get serviceBusTagline => 'உங்கள் இருக்கையைத் தேர்ந்தெடுங்கள்';

  @override
  String get serviceBusBlurb =>
      'நேரலை இருக்கை வரைபடத்துடன் நகரங்களுக்கு இடையிலான ஸ்லீப்பர், சீட்டர் பேருந்துகள்.';

  @override
  String get serviceToursTitle => 'விடுமுறைப் பயணம்';

  @override
  String get serviceToursAction => 'சுற்றுலாத் தொகுப்புகள்';

  @override
  String get serviceToursNav => 'விடுமுறைகள்';

  @override
  String get serviceToursTagline => 'தேர்ந்தெடுத்த சுற்றுலாக்கள்';

  @override
  String get serviceToursBlurb =>
      'இந்தியாவிலும் வெளிநாடுகளிலும் தேர்ந்தெடுத்த, அனைத்தும் அடங்கிய விடுமுறைகள்.';

  @override
  String get serviceRentTitle => 'வாடகை கார்';

  @override
  String get serviceRentAction => 'கார் வாடகைக்கு';

  @override
  String get serviceRentNav => 'கார் வாடகை';

  @override
  String get serviceRentTagline => 'நீங்களே ஓட்டுங்கள்';

  @override
  String get serviceRentBlurb =>
      'மணி, நாள் அல்லது வாரக் கணக்கில், நீங்களே ஓட்டும் அல்லது ஓட்டுநருடன் கார்கள்.';

  @override
  String get serviceRentalsTitle => 'வாடகைப் பயணம்';

  @override
  String get serviceRentalsAction => 'பயண வாகன வாடகை';

  @override
  String get serviceRentalsNav => 'குழுப் பயணம்';

  @override
  String get serviceRentalsTagline => 'சேர்ந்து பயணியுங்கள்';

  @override
  String get serviceRentalsBlurb =>
      'குடும்ப, குழுப் பயணங்களுக்கு டெம்போ டிராவலர், அர்பேனியா, கோச் வாகனங்கள்.';

  @override
  String get serviceParcelTitle => 'பார்சல்';

  @override
  String get serviceParcelAction => 'பார்சல் அனுப்பு';

  @override
  String get serviceParcelNav => 'பார்சல்';

  @override
  String get serviceParcelTagline => 'பஸ்ஸில் அனுப்புங்கள்';

  @override
  String get serviceParcelBlurb =>
      'நகரங்களுக்கு இடையே பஸ்ஸில் பார்சல், கவுண்டரிலிருந்து கவுண்டருக்கு.';

  @override
  String get servicesSheetTitle => 'எதை முன்பதிவு செய்ய விரும்புகிறீர்கள்?';

  @override
  String get servicesSheetPartner =>
      'QuikFly-யுடன் ஓட்டுங்கள் அல்லது உங்கள் வாகனங்களைப் பட்டியலிடுங்கள்';

  @override
  String get footerTagline =>
      'சவாரி, பேருந்து, விடுமுறை, வாடகை அனைத்தும் ஒரே செயலியில். ஒரே உள்நுழைவு, ஒரே வாலட், எல்லாப் பயணங்களுக்கும்.';

  @override
  String get footerAndroid => 'Android செயலி (APK)';

  @override
  String get footerIphone => 'iPhone: விரைவில்';

  @override
  String get footerCompany => 'நிறுவனம்';

  @override
  String get footerSupport => 'உதவி மையம்';

  @override
  String get footerSafety => 'பாதுகாப்பு';

  @override
  String get footerCancellation => 'ரத்து & பணத்திருப்பம்';

  @override
  String footerRights(Object year) {
    return '© $year QuikFly. அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.';
  }

  @override
  String get footerMadeBy => 'சென்னையில் உருவானது · வடிவமைத்து உருவாக்கியவர்';

  @override
  String get linkHelpCentre => 'உதவி மையம்';

  @override
  String get linkBecomePartner => 'கூட்டாளராகுங்கள்';

  @override
  String get linkMyTrips => 'என் பயணங்கள்';

  @override
  String get linkOffersCoupons => 'சலுகைகள் & கூப்பன்கள்';

  @override
  String get linkPrivacyNotice => 'தனியுரிமை அறிவிப்பு';

  @override
  String get linkSafetyContacts => 'பாதுகாப்பு & அவசரத் தொடர்புகள்';

  @override
  String get linkReferEarn => 'பரிந்துரைத்து சம்பாதியுங்கள்';

  @override
  String get accountYour => 'உங்கள் கணக்கு';

  @override
  String get accountEditProfile => 'சுயவிவரத்தைத் திருத்து';

  @override
  String get accountAddName => 'உங்கள் பெயரைச் சேர்க்கவும்';

  @override
  String get accountWallet => 'QuikFly வாலட்';

  @override
  String get accountHistory => 'வரலாறு';

  @override
  String get accountAllSettings => 'அனைத்து கணக்கு அமைப்புகள்';

  @override
  String get accountSettings => 'கணக்கு அமைப்புகள்';

  @override
  String get accountSupportTickets => 'உதவிக் கோரிக்கைகள்';

  @override
  String get accountSignOut => 'வெளியேறு';

  @override
  String get accountSignedOut => 'வெளியேறிவிட்டீர்கள்';

  @override
  String get accountSignInPrompt =>
      'உங்கள் சுயவிவரம், வாலட், சேமித்த இடங்கள், பாதுகாப்பு அமைப்புகளை நிர்வகிக்க உள்நுழையவும்.';

  @override
  String get accountOneAccount =>
      'சவாரி, பேருந்து, விடுமுறை, வாடகை அனைத்துக்கும் ஒரே கணக்கு';

  @override
  String accountNewWallet(Object amount) {
    return 'புதிய கணக்குகளின் வாலட்டில் தொடக்கத்திலேயே $amount இருக்கும்.';
  }

  @override
  String get accountTheme => 'தோற்றம்';

  @override
  String get accountThemeAuto => 'தானியங்கி';

  @override
  String get accountThemeLight => 'வெளிர்';

  @override
  String get accountThemeDark => 'இருள்';

  @override
  String get sectionProfile => 'சுயவிவரம்';

  @override
  String get sectionProfileHint => 'பெயர், மின்னஞ்சல், பாலினம், பிறந்த தேதி';

  @override
  String get sectionWallet => 'வாலட்';

  @override
  String get sectionWalletHint => 'இருப்பு மற்றும் வரலாறு';

  @override
  String get sectionReferHint => 'நண்பர்களை அழையுங்கள், இருவருக்கும் கிரெடிட்';

  @override
  String get sectionPlaces => 'சேமித்த இடங்கள்';

  @override
  String get sectionPlacesHint => 'வீடு, அலுவலகம், பிடித்தவை';

  @override
  String get sectionTravellers => 'சேமித்த பயணிகள்';

  @override
  String get sectionTravellersHint => 'ஒரே தட்டலில் முன்பதிவை நிரப்புங்கள்';

  @override
  String get sectionSafety => 'பாதுகாப்பு';

  @override
  String get sectionSafetyHint => 'அவசரத் தொடர்புகள், பயணப் பகிர்வு';

  @override
  String get sectionLicence => 'ஓட்டுநர் உரிமம்';

  @override
  String get sectionLicenceHint => 'நீங்களே ஓட்டுவதற்குத் தேவை';

  @override
  String get sectionSupport => 'உதவி';

  @override
  String get sectionSupportHint => 'கோரிக்கைகள், திரும்ப அழைப்பு';

  @override
  String get sectionBusiness => 'வணிகம் / GST';

  @override
  String get sectionBusinessHint => 'விலைப்பட்டியலில் GST விவரங்கள்';

  @override
  String get sectionPrivacy => 'தனியுரிமை & தரவு';

  @override
  String get sectionPrivacyHint =>
      'உங்கள் தரவைப் பதிவிறக்கு, தனியுரிமை அறிவிப்பு';

  @override
  String get sectionSecurity => 'உள்நுழைவு & பாதுகாப்பு';

  @override
  String get sectionSecurityHint => 'எண், சாதனங்கள், கணக்கை நீக்கு';

  @override
  String get licenceVerified => 'சரிபார்க்கப்பட்டது';

  @override
  String get licenceInReview => 'பரிசீலனையில்';

  @override
  String get licenceNotApproved => 'ஏற்கப்படவில்லை';

  @override
  String get licenceAdd => 'சேர்';

  @override
  String get loginTitle => 'உள்நுழை அல்லது பதிவு செய்';

  @override
  String get loginOtpTitle => 'OTP-ஐச் சரிபார்';

  @override
  String get loginProfileTitle => 'உங்கள் சுயவிவரத்தை நிறைவு செய்யுங்கள்';

  @override
  String get loginIntro =>
      'சவாரி, பேருந்து, விடுமுறை, வாடகை அனைத்துக்கும் ஒரே கணக்கு. புதியவரா? OTP-க்குப் பிறகு உங்கள் கணக்கை உருவாக்குவோம்.';

  @override
  String get loginMobile => 'கைபேசி எண்';

  @override
  String get loginUseSim => 'இந்த போனில் உள்ள எண்ணைப் பயன்படுத்து';

  @override
  String get loginChangeNumber => 'எண்ணை மாற்று';

  @override
  String get loginSendOtp => 'OTP அனுப்பு';

  @override
  String get loginPrivacy =>
      'உங்கள் தரவை எப்படிப் பயன்படுத்துகிறோம்: எங்கள் தனியுரிமை அறிவிப்பைப் படியுங்கள்.';

  @override
  String loginCodeSent(Object phone) {
    return '$phone எண்ணுக்கு அனுப்பிய 4 இலக்கக் குறியீட்டை உள்ளிடுங்கள்.';
  }

  @override
  String get loginChange => 'மாற்று';

  @override
  String loginDemoOtp(Object otp) {
    return 'டெமோ: SMS அனுப்பப்படாது. OTP $otp பயன்படுத்துங்கள்';
  }

  @override
  String get loginVerify => 'சரிபார்த்துத் தொடரவும்';

  @override
  String get loginYoureIn =>
      'உள்ளே வந்துவிட்டீர்கள்! ஓட்டுநர்களும் பேருந்து நடத்துநர்களும் உங்களை அடையாளம் காண உங்கள் பெயரைச் சொல்லுங்கள்.';

  @override
  String get loginFullName => 'முழுப் பெயர்';

  @override
  String get loginNameExample => 'எ.கா. பிரியா ராமன்';

  @override
  String get loginEmailOptional => 'மின்னஞ்சல் (விருப்பத்தேர்வு)';

  @override
  String get loginEmailHint => 'டிக்கெட்டுகள், விலைப்பட்டியல்களுக்கு';

  @override
  String get loginReferralCode => 'பரிந்துரைக் குறியீடு';

  @override
  String loginReferralBonus(Object amount) {
    return 'நீங்களும் உங்கள் நண்பரும் தலா $amount வாலட்டில் பெறுவீர்கள்.';
  }

  @override
  String get loginHaveCode => 'பரிந்துரைக் குறியீடு உள்ளதா?';

  @override
  String get loginCreate => 'என் கணக்கை உருவாக்கு';

  @override
  String get loginErrPhone => 'சரியான 10 இலக்கக் கைபேசி எண்ணை உள்ளிடுங்கள்';

  @override
  String get loginErrName => 'உங்கள் பெயரை உள்ளிடுங்கள்';

  @override
  String get loginErrEmail =>
      'சரியான மின்னஞ்சலை உள்ளிடுங்கள் அல்லது காலியாக விடுங்கள்';

  @override
  String get loginRestored =>
      'மீண்டும் வருக! உங்கள் கணக்கு நீக்கம் ரத்து செய்யப்பட்டது.';

  @override
  String loginWelcomeBack(Object name) {
    return 'மீண்டும் வருக, $name!';
  }

  @override
  String loginReferralApplied(Object amount) {
    return 'பரிந்துரை ஏற்கப்பட்டது: உங்கள் வாலட்டில் $amount சேர்க்கப்பட்டது';
  }

  @override
  String get loginReferralRetry =>
      'வேறு குறியீட்டை முயலலாம் அல்லது குறியீடு இல்லாமலேயே தொடரலாம்.';

  @override
  String loginWelcomeNew(Object name) {
    return 'QuikFly-க்கு வருக, $name!';
  }

  @override
  String loginWalletCredit(Object amount) {
    return '$amount வரவேற்புக் கிரெடிட் உங்கள் வாலட்டில் உள்ளது.';
  }

  @override
  String get otpLabel => 'OTP';

  @override
  String get privacyTitle => 'உங்கள் தனியுரிமை';

  @override
  String get privacyBefore =>
      'தொடர்வதற்கு முன், QuikFly உங்கள் தரவை எப்படிப் பயன்படுத்துகிறது என்பது இதோ:';

  @override
  String get privacyReadFull => 'முழுத் தனியுரிமை அறிவிப்பைப் படியுங்கள்';

  @override
  String get privacyReadFullWhy =>
      'விவரங்கள், உங்கள் உரிமைகள், யாரைத் தொடர்புகொள்வது.';

  @override
  String get privacyAgree => 'ஒப்புக்கொள்கிறேன், தொடரவும்';

  @override
  String get privacyDecline => 'ஒப்புக்கொள்ளவில்லை, வெளியேற்று';

  @override
  String privacyLastUpdated(Object date) {
    return 'கடைசியாகப் புதுப்பித்தது $date';
  }

  @override
  String privacyNoticeSub(Object date) {
    return 'QuikFly உங்கள் தனிப்பட்ட தரவை எப்படிக் கையாள்கிறது. கடைசியாகப் புதுப்பித்தது $date.';
  }

  @override
  String get privacyInShort => 'சுருக்கமாக';

  @override
  String get privacyContactTitle => 'குறைதீர் அலுவலரைத் தொடர்புகொள்ளுங்கள்';

  @override
  String get privacyContactSub =>
      'கேள்விகள், திருத்தங்கள், புகார்கள் அல்லது ஒருவரை நியமிக்க: எழுதுங்கள் அல்லது அழையுங்கள். 30 நாட்களுக்குள் பதிலளிப்போம்.';

  @override
  String get privacySignedInHint =>
      'உள்நுழைந்துள்ளீர்களா? கணக்கு → தனியுரிமை & தரவு பக்கத்தில் உங்கள் தரவைப் பதிவிறக்கலாம் அல்லது கணக்கை நீக்கலாம்.';

  @override
  String get privacyRightsSub =>
      'இந்தியாவின் டிஜிட்டல் தனிப்பட்ட தரவுப் பாதுகாப்புச் சட்டத்தின் கீழ் உங்கள் உரிமைகள்.';

  @override
  String privacyAgreedOn(Object date) {
    return '$date தேதியிட்ட அறிவிப்புக்கு ஒப்புக்கொண்டீர்கள்.';
  }

  @override
  String get privacyNotAgreed =>
      'நீங்கள் இன்னும் தனியுரிமை அறிவிப்புக்கு ஒப்புக்கொள்ளவில்லை.';

  @override
  String get privacyReadIt => 'தனியுரிமை அறிவிப்பைப் படியுங்கள்';

  @override
  String get privacyDownloadTitle => 'உங்கள் தரவைப் பதிவிறக்குங்கள்';

  @override
  String get privacyDownloadSub =>
      'உங்கள் சுயவிவரம், முன்பதிவுகள், வாலட், சேமித்த இடங்கள், பயணிகள், தொடர்புகள், அறிவிப்புகள், உதவிக் கோரிக்கைகள் அனைத்தும் ஒரே கோப்பில்.';

  @override
  String get privacyDownloadButton => 'பதிவிறக்கு (JSON)';

  @override
  String get privacyDownloading => 'உங்கள் தரவு பதிவிறங்குகிறது';

  @override
  String get privacyEraseTitle => 'திருத்து அல்லது அழி';

  @override
  String privacyEraseSub(Object days) {
    return 'உங்கள் விவரங்களைச் சுயவிவரத்தில் திருத்துங்கள். ஒப்புதலைத் திரும்பப் பெற்று உங்கள் தரவை அழிக்க, கணக்கை நீக்குங்கள்: அது உடனே மூடப்பட்டு $days நாட்களுக்குப் பிறகு அழிக்கப்படும்.';
  }

  @override
  String get privacyEraseElsewhere =>
      'உங்கள் விவரங்களைச் சுயவிவரத்தில் திருத்துங்கள். ஒப்புதலைத் திரும்பப் பெற்று உங்கள் தரவை அழிக்க, QuikFly செயலியில் அல்லது இணையதளத்தில் (கணக்கு → உள்நுழைவு & பாதுகாப்பு) கணக்கை நீக்குங்கள்.';

  @override
  String get privacyGoSecurity => 'உள்நுழைவு & பாதுகாப்புக்குச் செல்';

  @override
  String get privacyDeleteAccount => 'கணக்கை நீக்கு';

  @override
  String get privacyQuestionsTitle => 'கேள்விகள் அல்லது புகார்கள்';

  @override
  String privacyQuestionsSub(Object email, Object name, Object phone) {
    return 'எங்கள் குறைதீர் அலுவலர் $name அவர்களுக்கு $email முகவரிக்கு எழுதுங்கள் அல்லது $phone எண்ணில் அழையுங்கள்.';
  }

  @override
  String get navMain => 'முதன்மை மெனு';
}

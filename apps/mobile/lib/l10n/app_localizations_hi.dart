// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Hindi (`hi`).
class LHi extends L {
  LHi([String locale = 'hi']) : super(locale);

  @override
  String get langName => 'हिन्दी';

  @override
  String get langMenu => 'भाषा';

  @override
  String get langNote => 'तमिल और हिन्दी नई हैं। कुछ गलत लगे तो हमें बताएँ।';

  @override
  String get navHome => 'होम';

  @override
  String get navServices => 'सेवाएँ';

  @override
  String get navOffers => 'ऑफ़र';

  @override
  String get navMyTrips => 'मेरी यात्राएँ';

  @override
  String get navAccount => 'खाता';

  @override
  String get navLogin => 'लॉग इन';

  @override
  String get navHelp => 'मदद';

  @override
  String get navNotifications => 'सूचनाएँ';

  @override
  String navNotificationsUnread(Object count) {
    return 'सूचनाएँ, $count अपठित';
  }

  @override
  String get navAllServices => 'सभी सेवाएँ';

  @override
  String get navWallet => 'वॉलेट';

  @override
  String get navMyAccount => 'मेरा खाता';

  @override
  String navUpcoming(Object count) {
    return '$count आने वाली';
  }

  @override
  String get navLogoHome => 'QuikFly होम';

  @override
  String get bannerDemo => 'डेमो मोड · नमूना डेटा';

  @override
  String get bannerPreview => 'प्रीव्यू';

  @override
  String get bannerOtp => 'लॉग इन OTP है';

  @override
  String get serviceBikeTitle => 'बाइक';

  @override
  String get serviceBikeAction => 'बाइक टैक्सी';

  @override
  String get serviceBikeNav => 'बाइक टैक्सी';

  @override
  String get serviceBikeTagline => 'ट्रैफ़िक से बचें';

  @override
  String get serviceBikeBlurb =>
      'बाइक, ई-बाइक और ऑटो 5 मिनट से कम में आपके दरवाज़े पर।';

  @override
  String get serviceCarTitle => 'कार';

  @override
  String get serviceCarAction => 'कार राइड';

  @override
  String get serviceCarNav => 'कैब';

  @override
  String get serviceCarTagline => 'आराम से सफ़र करें';

  @override
  String get serviceCarBlurb =>
      'मिनी, सेडान, SUV या प्राइम: पहले से तय किराया और सत्यापित ड्राइवर।';

  @override
  String get serviceBusTitle => 'बस यात्रा';

  @override
  String get serviceBusAction => 'बस बुकिंग';

  @override
  String get serviceBusNav => 'बस';

  @override
  String get serviceBusTagline => 'अपनी सीट चुनें';

  @override
  String get serviceBusBlurb =>
      'लाइव सीट मैप के साथ इंटरसिटी स्लीपर और सीटर बसें।';

  @override
  String get serviceToursTitle => 'हॉलिडे ट्रिप';

  @override
  String get serviceToursAction => 'टूर पैकेज';

  @override
  String get serviceToursNav => 'हॉलिडे';

  @override
  String get serviceToursTagline => 'चुनिंदा छुट्टियाँ';

  @override
  String get serviceToursBlurb =>
      'भारत और विदेश में चुनिंदा, सब कुछ शामिल छुट्टियाँ।';

  @override
  String get serviceRentTitle => 'रेंटल कार';

  @override
  String get serviceRentAction => 'कार किराये पर लें';

  @override
  String get serviceRentNav => 'कार किराया';

  @override
  String get serviceRentTagline => 'खुद चलाएँ';

  @override
  String get serviceRentBlurb =>
      'घंटे, दिन या हफ़्ते के हिसाब से सेल्फ़-ड्राइव या ड्राइवर वाली कारें।';

  @override
  String get serviceRentalsTitle => 'रेंटल ट्रिप';

  @override
  String get serviceRentalsAction => 'यात्रा वाहन किराया';

  @override
  String get serviceRentalsNav => 'ग्रुप यात्रा';

  @override
  String get serviceRentalsTagline => 'साथ मिलकर सफ़र करें';

  @override
  String get serviceRentalsBlurb =>
      'परिवार और ग्रुप यात्राओं के लिए टेम्पो ट्रैवलर, अर्बानिया और कोच।';

  @override
  String get serviceParcelTitle => 'पार्सल';

  @override
  String get serviceParcelAction => 'पार्सल भेजें';

  @override
  String get serviceParcelNav => 'पार्सल';

  @override
  String get serviceParcelTagline => 'बस से भेजें';

  @override
  String get serviceParcelBlurb =>
      'शहरों के बीच बस से पार्सल, काउंटर से काउंटर तक।';

  @override
  String get servicesSheetTitle => 'आप क्या बुक करना चाहेंगे?';

  @override
  String get servicesSheetPartner =>
      'QuikFly के साथ गाड़ी चलाएँ या अपनी गाड़ियाँ जोड़ें';

  @override
  String get footerTagline =>
      'राइड, बस, छुट्टियाँ और किराये की गाड़ियाँ, सब एक ऐप में। एक लॉग इन, एक वॉलेट, हर सफ़र।';

  @override
  String get footerAndroid => 'Android ऐप (APK)';

  @override
  String get footerIphone => 'iPhone: बाद में आएगा';

  @override
  String get footerCompany => 'कंपनी';

  @override
  String get footerSupport => 'सहायता';

  @override
  String get footerSafety => 'सुरक्षा';

  @override
  String get footerCancellation => 'रद्दीकरण और रिफ़ंड';

  @override
  String footerRights(Object year) {
    return '© $year QuikFly. सर्वाधिकार सुरक्षित।';
  }

  @override
  String get footerMadeBy => 'चेन्नई में बना · डिज़ाइन और निर्माण';

  @override
  String get linkHelpCentre => 'सहायता केंद्र';

  @override
  String get linkDriveWithUs => 'QuikFly के साथ ड्राइव करें';

  @override
  String get linkBecomePartner => 'पार्टनर बनें';

  @override
  String get linkMyTrips => 'मेरी यात्राएँ';

  @override
  String get linkOffersCoupons => 'ऑफ़र और कूपन';

  @override
  String get linkPrivacyNotice => 'निजता सूचना';

  @override
  String get linkSafetyContacts => 'सुरक्षा और आपातकालीन संपर्क';

  @override
  String get linkReferEarn => 'रेफ़र करें और कमाएँ';

  @override
  String get accountYour => 'आपका खाता';

  @override
  String get accountEditProfile => 'प्रोफ़ाइल बदलें';

  @override
  String get accountAddName => 'अपना नाम जोड़ें';

  @override
  String get accountWallet => 'QuikFly वॉलेट';

  @override
  String get accountHistory => 'इतिहास';

  @override
  String get accountAllSettings => 'खाते की सभी सेटिंग';

  @override
  String get accountSettings => 'खाता सेटिंग';

  @override
  String get accountSupportTickets => 'सहायता टिकट';

  @override
  String get accountSignOut => 'साइन आउट';

  @override
  String get accountSignedOut => 'साइन आउट हो गया';

  @override
  String get accountSignInPrompt =>
      'अपनी प्रोफ़ाइल, वॉलेट, सेव की गई जगहें और सुरक्षा सेटिंग संभालने के लिए साइन इन करें।';

  @override
  String get accountOneAccount =>
      'राइड, बस, छुट्टियों और किराये के लिए एक ही खाता';

  @override
  String accountNewWallet(Object amount) {
    return 'नए खातों के वॉलेट में शुरुआत में $amount होते हैं।';
  }

  @override
  String get accountTheme => 'थीम';

  @override
  String get accountThemeAuto => 'ऑटो';

  @override
  String get accountThemeLight => 'लाइट';

  @override
  String get accountThemeDark => 'डार्क';

  @override
  String get sectionProfile => 'प्रोफ़ाइल';

  @override
  String get sectionProfileHint => 'नाम, ईमेल, लिंग, जन्मतिथि';

  @override
  String get sectionWallet => 'वॉलेट';

  @override
  String get sectionWalletHint => 'बैलेंस और इतिहास';

  @override
  String get sectionReferHint => 'दोस्तों को बुलाएँ, दोनों को क्रेडिट मिलेगा';

  @override
  String get sectionPlaces => 'सेव की गई जगहें';

  @override
  String get sectionPlacesHint => 'घर, ऑफ़िस और पसंदीदा';

  @override
  String get sectionTravellers => 'सेव किए गए यात्री';

  @override
  String get sectionTravellersHint => 'एक टैप में बुकिंग भरें';

  @override
  String get sectionSafety => 'सुरक्षा';

  @override
  String get sectionNotificationsHint => 'इस ब्राउज़र में यात्रा की सूचनाएँ';

  @override
  String get sectionSafetyHint => 'आपातकालीन संपर्क, यात्रा शेयर करना';

  @override
  String get sectionLicence => 'ड्राइविंग लाइसेंस';

  @override
  String get sectionLicenceHint => 'सेल्फ़-ड्राइव के लिए ज़रूरी';

  @override
  String get sectionSupport => 'सहायता';

  @override
  String get sectionSupportHint => 'टिकट और कॉलबैक अनुरोध';

  @override
  String get sectionBusiness => 'बिज़नेस / GST';

  @override
  String get sectionBusinessHint => 'इनवॉइस पर GST विवरण';

  @override
  String get sectionPrivacy => 'निजता और डेटा';

  @override
  String get sectionPrivacyHint => 'अपना डेटा डाउनलोड करें, निजता सूचना';

  @override
  String get sectionSecurity => 'लॉग इन और सुरक्षा';

  @override
  String get sectionSecurityHint => 'नंबर, डिवाइस, खाता हटाएँ';

  @override
  String get licenceVerified => 'सत्यापित';

  @override
  String get licenceInReview => 'जाँच में';

  @override
  String get licenceNotApproved => 'स्वीकृत नहीं';

  @override
  String get licenceAdd => 'जोड़ें';

  @override
  String get loginTitle => 'लॉग इन या साइन अप करें';

  @override
  String get loginOtpTitle => 'OTP सत्यापित करें';

  @override
  String get loginProfileTitle => 'अपनी प्रोफ़ाइल पूरी करें';

  @override
  String get loginIntro =>
      'राइड, बस, छुट्टियों और किराये के लिए एक ही खाता। नए हैं? OTP के बाद हम आपका खाता बना देंगे।';

  @override
  String get loginMobile => 'मोबाइल नंबर';

  @override
  String get loginUseSim => 'इस फ़ोन का नंबर इस्तेमाल करें';

  @override
  String get loginChangeNumber => 'नंबर बदलें';

  @override
  String get loginSendOtp => 'OTP भेजें';

  @override
  String get loginPrivacy =>
      'हम आपका डेटा कैसे इस्तेमाल करते हैं: हमारी निजता सूचना पढ़ें।';

  @override
  String loginCodeSent(Object phone) {
    return '$phone पर भेजा गया 4 अंकों का कोड डालें।';
  }

  @override
  String get loginChange => 'बदलें';

  @override
  String loginDemoOtp(Object otp) {
    return 'डेमो: कोई SMS नहीं भेजा जाता। OTP $otp डालें';
  }

  @override
  String get loginVerify => 'सत्यापित करें और आगे बढ़ें';

  @override
  String get loginYoureIn =>
      'आप अंदर हैं! अपना नाम बताएँ ताकि ड्राइवर और बस ऑपरेटर आपको पहचान सकें।';

  @override
  String get loginFullName => 'पूरा नाम';

  @override
  String get loginNameExample => 'जैसे प्रिया रमन';

  @override
  String get loginEmailOptional => 'ईमेल (वैकल्पिक)';

  @override
  String get loginEmailHint => 'टिकट और इनवॉइस के लिए';

  @override
  String get loginReferralCode => 'रेफ़रल कोड';

  @override
  String loginReferralBonus(Object amount) {
    return 'आपको और आपके दोस्त, दोनों को वॉलेट में $amount मिलेंगे।';
  }

  @override
  String get loginHaveCode => 'रेफ़रल कोड है?';

  @override
  String get loginCreate => 'मेरा खाता बनाएँ';

  @override
  String get loginErrPhone => 'सही 10 अंकों का मोबाइल नंबर डालें';

  @override
  String get loginErrName => 'कृपया अपना नाम डालें';

  @override
  String get loginErrEmail => 'सही ईमेल डालें या खाली छोड़ दें';

  @override
  String get loginRestored => 'फिर से स्वागत है! आपका खाता हटाना रद्द हो गया।';

  @override
  String loginWelcomeBack(Object name) {
    return 'फिर से स्वागत है, $name!';
  }

  @override
  String loginReferralApplied(Object amount) {
    return 'रेफ़रल लागू: आपके वॉलेट में $amount जुड़ गए';
  }

  @override
  String get loginReferralRetry =>
      'आप दूसरा कोड आज़मा सकते हैं या बिना कोड के आगे बढ़ सकते हैं।';

  @override
  String loginWelcomeNew(Object name) {
    return 'QuikFly में आपका स्वागत है, $name!';
  }

  @override
  String loginWalletCredit(Object amount) {
    return '$amount का वेलकम क्रेडिट आपके वॉलेट में है।';
  }

  @override
  String get otpLabel => 'OTP';

  @override
  String get privacyTitle => 'आपकी निजता';

  @override
  String get privacyBefore =>
      'आगे बढ़ने से पहले, जानिए QuikFly आपका डेटा कैसे इस्तेमाल करता है:';

  @override
  String get privacyReadFull => 'पूरी निजता सूचना पढ़ें';

  @override
  String get privacyReadFullWhy => 'विवरण, आपके अधिकार और किससे संपर्क करें।';

  @override
  String get privacyAgree => 'मैं सहमत हूँ, आगे बढ़ें';

  @override
  String get privacyDecline => 'सहमत नहीं, मुझे साइन आउट करें';

  @override
  String privacyLastUpdated(Object date) {
    return 'आखिरी बार अपडेट $date';
  }

  @override
  String privacyNoticeSub(Object date) {
    return 'QuikFly आपके निजी डेटा को कैसे संभालता है। आखिरी बार अपडेट $date।';
  }

  @override
  String get privacyInShort => 'संक्षेप में';

  @override
  String get privacyContactTitle => 'शिकायत अधिकारी से संपर्क करें';

  @override
  String get privacyContactSub =>
      'सवाल, सुधार, शिकायत या किसी को नामित करना हो: लिखें या कॉल करें। हम 30 दिनों में जवाब देंगे।';

  @override
  String get privacySignedInHint =>
      'साइन इन हैं? खाता → निजता और डेटा में जाकर अपना डेटा डाउनलोड करें या खाता हटाएँ।';

  @override
  String get privacyRightsSub =>
      'भारत के डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम के तहत आपके अधिकार।';

  @override
  String privacyAgreedOn(Object date) {
    return 'आपने $date की सूचना पर सहमति दी है।';
  }

  @override
  String get privacyNotAgreed => 'आपने अभी तक निजता सूचना पर सहमति नहीं दी है।';

  @override
  String get privacyReadIt => 'निजता सूचना पढ़ें';

  @override
  String get privacyDownloadTitle => 'अपना डेटा डाउनलोड करें';

  @override
  String get privacyDownloadSub =>
      'आपकी प्रोफ़ाइल, बुकिंग, वॉलेट, सेव की गई जगहें, यात्री, संपर्क, सूचनाएँ और सहायता अनुरोध, सब एक फ़ाइल में।';

  @override
  String get privacyDownloadButton => 'डाउनलोड करें (JSON)';

  @override
  String get privacyDownloading => 'आपका डेटा डाउनलोड हो रहा है';

  @override
  String get privacyEraseTitle => 'सुधारें या मिटाएँ';

  @override
  String privacyEraseSub(Object days) {
    return 'अपनी जानकारी प्रोफ़ाइल में ठीक करें। सहमति वापस लेने और अपना डेटा मिटाने के लिए खाता हटाएँ: यह अभी बंद होगा और $days दिन बाद मिटा दिया जाएगा।';
  }

  @override
  String get privacyEraseElsewhere =>
      'अपनी जानकारी प्रोफ़ाइल में ठीक करें। सहमति वापस लेने और अपना डेटा मिटाने के लिए QuikFly ऐप या वेबसाइट पर (खाता → लॉग इन और सुरक्षा) अपना खाता हटाएँ।';

  @override
  String get privacyGoSecurity => 'लॉग इन और सुरक्षा पर जाएँ';

  @override
  String get privacyDeleteAccount => 'खाता हटाएँ';

  @override
  String get privacyQuestionsTitle => 'सवाल या शिकायतें';

  @override
  String privacyQuestionsSub(Object email, Object name, Object phone) {
    return 'हमारे शिकायत अधिकारी, $name, को $email पर लिखें या $phone पर कॉल करें।';
  }

  @override
  String get navMain => 'मुख्य मेनू';
}

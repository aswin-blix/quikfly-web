import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_hi.dart';
import 'app_localizations_ta.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of L
/// returned by `L.of(context)`.
///
/// Applications need to include `L.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: L.localizationsDelegates,
///   supportedLocales: L.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the L.supportedLocales
/// property.
abstract class L {
  L(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static L of(BuildContext context) {
    return Localizations.of<L>(context, L)!;
  }

  static const LocalizationsDelegate<L> delegate = _LDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('hi'),
    Locale('ta'),
  ];

  /// No description provided for @langName.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get langName;

  /// No description provided for @langMenu.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get langMenu;

  /// No description provided for @langNote.
  ///
  /// In en, this message translates to:
  /// **'Tamil and Hindi are new. Tell us if anything reads wrong.'**
  String get langNote;

  /// No description provided for @navHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// No description provided for @navServices.
  ///
  /// In en, this message translates to:
  /// **'Services'**
  String get navServices;

  /// No description provided for @navOffers.
  ///
  /// In en, this message translates to:
  /// **'Offers'**
  String get navOffers;

  /// No description provided for @navMyTrips.
  ///
  /// In en, this message translates to:
  /// **'My Trips'**
  String get navMyTrips;

  /// No description provided for @navAccount.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get navAccount;

  /// No description provided for @navLogin.
  ///
  /// In en, this message translates to:
  /// **'Login'**
  String get navLogin;

  /// No description provided for @navHelp.
  ///
  /// In en, this message translates to:
  /// **'Help'**
  String get navHelp;

  /// No description provided for @navNotifications.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get navNotifications;

  /// No description provided for @navNotificationsUnread.
  ///
  /// In en, this message translates to:
  /// **'Notifications, {count} unread'**
  String navNotificationsUnread(Object count);

  /// No description provided for @navAllServices.
  ///
  /// In en, this message translates to:
  /// **'All services'**
  String get navAllServices;

  /// No description provided for @navWallet.
  ///
  /// In en, this message translates to:
  /// **'Wallet'**
  String get navWallet;

  /// No description provided for @navMyAccount.
  ///
  /// In en, this message translates to:
  /// **'My account'**
  String get navMyAccount;

  /// No description provided for @navUpcoming.
  ///
  /// In en, this message translates to:
  /// **'{count} upcoming'**
  String navUpcoming(Object count);

  /// No description provided for @navLogoHome.
  ///
  /// In en, this message translates to:
  /// **'QuikFly home'**
  String get navLogoHome;

  /// No description provided for @bannerDemo.
  ///
  /// In en, this message translates to:
  /// **'DEMO MODE · sample data'**
  String get bannerDemo;

  /// No description provided for @bannerPreview.
  ///
  /// In en, this message translates to:
  /// **'PREVIEW'**
  String get bannerPreview;

  /// No description provided for @bannerOtp.
  ///
  /// In en, this message translates to:
  /// **'login OTP is'**
  String get bannerOtp;

  /// No description provided for @serviceBikeTitle.
  ///
  /// In en, this message translates to:
  /// **'Bike'**
  String get serviceBikeTitle;

  /// No description provided for @serviceBikeAction.
  ///
  /// In en, this message translates to:
  /// **'Bike Taxi'**
  String get serviceBikeAction;

  /// No description provided for @serviceBikeNav.
  ///
  /// In en, this message translates to:
  /// **'Bike Taxi'**
  String get serviceBikeNav;

  /// No description provided for @serviceBikeTagline.
  ///
  /// In en, this message translates to:
  /// **'Beat the traffic'**
  String get serviceBikeTagline;

  /// No description provided for @serviceBikeBlurb.
  ///
  /// In en, this message translates to:
  /// **'Bikes, e-bikes & autos at your doorstep in under 5 minutes.'**
  String get serviceBikeBlurb;

  /// No description provided for @serviceCarTitle.
  ///
  /// In en, this message translates to:
  /// **'Car'**
  String get serviceCarTitle;

  /// No description provided for @serviceCarAction.
  ///
  /// In en, this message translates to:
  /// **'Car Ride'**
  String get serviceCarAction;

  /// No description provided for @serviceCarNav.
  ///
  /// In en, this message translates to:
  /// **'Cabs'**
  String get serviceCarNav;

  /// No description provided for @serviceCarTagline.
  ///
  /// In en, this message translates to:
  /// **'Ride in comfort'**
  String get serviceCarTagline;

  /// No description provided for @serviceCarBlurb.
  ///
  /// In en, this message translates to:
  /// **'Mini, Sedan, SUV or Prime with upfront fares and verified drivers.'**
  String get serviceCarBlurb;

  /// No description provided for @serviceBusTitle.
  ///
  /// In en, this message translates to:
  /// **'Travels'**
  String get serviceBusTitle;

  /// No description provided for @serviceBusAction.
  ///
  /// In en, this message translates to:
  /// **'Bus Booking'**
  String get serviceBusAction;

  /// No description provided for @serviceBusNav.
  ///
  /// In en, this message translates to:
  /// **'Bus'**
  String get serviceBusNav;

  /// No description provided for @serviceBusTagline.
  ///
  /// In en, this message translates to:
  /// **'Pick your seat'**
  String get serviceBusTagline;

  /// No description provided for @serviceBusBlurb.
  ///
  /// In en, this message translates to:
  /// **'Intercity sleeper & seater buses with live seat maps.'**
  String get serviceBusBlurb;

  /// No description provided for @serviceToursTitle.
  ///
  /// In en, this message translates to:
  /// **'Holiday Trip'**
  String get serviceToursTitle;

  /// No description provided for @serviceToursAction.
  ///
  /// In en, this message translates to:
  /// **'Tour Packages'**
  String get serviceToursAction;

  /// No description provided for @serviceToursNav.
  ///
  /// In en, this message translates to:
  /// **'Holidays'**
  String get serviceToursNav;

  /// No description provided for @serviceToursTagline.
  ///
  /// In en, this message translates to:
  /// **'Curated getaways'**
  String get serviceToursTagline;

  /// No description provided for @serviceToursBlurb.
  ///
  /// In en, this message translates to:
  /// **'Handpicked holidays across India and abroad, all-inclusive.'**
  String get serviceToursBlurb;

  /// No description provided for @serviceRentTitle.
  ///
  /// In en, this message translates to:
  /// **'Rental Car'**
  String get serviceRentTitle;

  /// No description provided for @serviceRentAction.
  ///
  /// In en, this message translates to:
  /// **'Rent a Car'**
  String get serviceRentAction;

  /// No description provided for @serviceRentNav.
  ///
  /// In en, this message translates to:
  /// **'Rent a Car'**
  String get serviceRentNav;

  /// No description provided for @serviceRentTagline.
  ///
  /// In en, this message translates to:
  /// **'Drive yourself'**
  String get serviceRentTagline;

  /// No description provided for @serviceRentBlurb.
  ///
  /// In en, this message translates to:
  /// **'Self-drive or chauffeur cars by the hour, day or week.'**
  String get serviceRentBlurb;

  /// No description provided for @serviceRentalsTitle.
  ///
  /// In en, this message translates to:
  /// **'Rental Trip'**
  String get serviceRentalsTitle;

  /// No description provided for @serviceRentalsAction.
  ///
  /// In en, this message translates to:
  /// **'Travel Rentals'**
  String get serviceRentalsAction;

  /// No description provided for @serviceRentalsNav.
  ///
  /// In en, this message translates to:
  /// **'Group Travel'**
  String get serviceRentalsNav;

  /// No description provided for @serviceRentalsTagline.
  ///
  /// In en, this message translates to:
  /// **'Travel together'**
  String get serviceRentalsTagline;

  /// No description provided for @serviceRentalsBlurb.
  ///
  /// In en, this message translates to:
  /// **'Tempo travellers, Urbanias & coaches for family and group trips.'**
  String get serviceRentalsBlurb;

  /// No description provided for @serviceParcelTitle.
  ///
  /// In en, this message translates to:
  /// **'Parcel'**
  String get serviceParcelTitle;

  /// No description provided for @serviceParcelAction.
  ///
  /// In en, this message translates to:
  /// **'Send a Parcel'**
  String get serviceParcelAction;

  /// No description provided for @serviceParcelNav.
  ///
  /// In en, this message translates to:
  /// **'Parcels'**
  String get serviceParcelNav;

  /// No description provided for @serviceParcelTagline.
  ///
  /// In en, this message translates to:
  /// **'Send it by bus'**
  String get serviceParcelTagline;

  /// No description provided for @serviceParcelBlurb.
  ///
  /// In en, this message translates to:
  /// **'Parcels between cities on the bus, counter to counter.'**
  String get serviceParcelBlurb;

  /// No description provided for @servicesSheetTitle.
  ///
  /// In en, this message translates to:
  /// **'What would you like to book?'**
  String get servicesSheetTitle;

  /// No description provided for @servicesSheetPartner.
  ///
  /// In en, this message translates to:
  /// **'Drive or list your fleet with QuikFly'**
  String get servicesSheetPartner;

  /// No description provided for @footerTagline.
  ///
  /// In en, this message translates to:
  /// **'Rides, buses, holidays and rentals in one app. One login, one wallet, every journey.'**
  String get footerTagline;

  /// No description provided for @footerAndroid.
  ///
  /// In en, this message translates to:
  /// **'Android app (APK)'**
  String get footerAndroid;

  /// No description provided for @footerIphone.
  ///
  /// In en, this message translates to:
  /// **'iPhone: coming later'**
  String get footerIphone;

  /// No description provided for @footerCompany.
  ///
  /// In en, this message translates to:
  /// **'Company'**
  String get footerCompany;

  /// No description provided for @footerSupport.
  ///
  /// In en, this message translates to:
  /// **'Support'**
  String get footerSupport;

  /// No description provided for @footerSafety.
  ///
  /// In en, this message translates to:
  /// **'Safety'**
  String get footerSafety;

  /// No description provided for @footerCancellation.
  ///
  /// In en, this message translates to:
  /// **'Cancellation & refunds'**
  String get footerCancellation;

  /// No description provided for @footerRights.
  ///
  /// In en, this message translates to:
  /// **'© {year} QuikFly. All rights reserved.'**
  String footerRights(Object year);

  /// No description provided for @footerMadeBy.
  ///
  /// In en, this message translates to:
  /// **'Made in Chennai · Designed & built by'**
  String get footerMadeBy;

  /// No description provided for @linkHelpCentre.
  ///
  /// In en, this message translates to:
  /// **'Help centre'**
  String get linkHelpCentre;

  /// No description provided for @linkBecomePartner.
  ///
  /// In en, this message translates to:
  /// **'Become a partner'**
  String get linkBecomePartner;

  /// No description provided for @linkMyTrips.
  ///
  /// In en, this message translates to:
  /// **'My trips'**
  String get linkMyTrips;

  /// No description provided for @linkOffersCoupons.
  ///
  /// In en, this message translates to:
  /// **'Offers & coupons'**
  String get linkOffersCoupons;

  /// No description provided for @linkPrivacyNotice.
  ///
  /// In en, this message translates to:
  /// **'Privacy notice'**
  String get linkPrivacyNotice;

  /// No description provided for @linkSafetyContacts.
  ///
  /// In en, this message translates to:
  /// **'Safety & emergency contacts'**
  String get linkSafetyContacts;

  /// No description provided for @linkReferEarn.
  ///
  /// In en, this message translates to:
  /// **'Refer & earn'**
  String get linkReferEarn;

  /// No description provided for @accountYour.
  ///
  /// In en, this message translates to:
  /// **'Your account'**
  String get accountYour;

  /// No description provided for @accountEditProfile.
  ///
  /// In en, this message translates to:
  /// **'Edit profile'**
  String get accountEditProfile;

  /// No description provided for @accountAddName.
  ///
  /// In en, this message translates to:
  /// **'Add your name'**
  String get accountAddName;

  /// No description provided for @accountWallet.
  ///
  /// In en, this message translates to:
  /// **'QuikFly wallet'**
  String get accountWallet;

  /// No description provided for @accountHistory.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get accountHistory;

  /// No description provided for @accountAllSettings.
  ///
  /// In en, this message translates to:
  /// **'All account settings'**
  String get accountAllSettings;

  /// No description provided for @accountSettings.
  ///
  /// In en, this message translates to:
  /// **'Account settings'**
  String get accountSettings;

  /// No description provided for @accountSupportTickets.
  ///
  /// In en, this message translates to:
  /// **'Support tickets'**
  String get accountSupportTickets;

  /// No description provided for @accountSignOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get accountSignOut;

  /// No description provided for @accountSignedOut.
  ///
  /// In en, this message translates to:
  /// **'Signed out'**
  String get accountSignedOut;

  /// No description provided for @accountSignInPrompt.
  ///
  /// In en, this message translates to:
  /// **'Sign in to manage your profile, wallet, saved places and safety settings.'**
  String get accountSignInPrompt;

  /// No description provided for @accountOneAccount.
  ///
  /// In en, this message translates to:
  /// **'One account for rides, buses, holidays and rentals'**
  String get accountOneAccount;

  /// No description provided for @accountNewWallet.
  ///
  /// In en, this message translates to:
  /// **'New accounts start with {amount} in the wallet.'**
  String accountNewWallet(Object amount);

  /// No description provided for @accountTheme.
  ///
  /// In en, this message translates to:
  /// **'Theme'**
  String get accountTheme;

  /// No description provided for @accountThemeAuto.
  ///
  /// In en, this message translates to:
  /// **'Auto'**
  String get accountThemeAuto;

  /// No description provided for @accountThemeLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get accountThemeLight;

  /// No description provided for @accountThemeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get accountThemeDark;

  /// No description provided for @sectionProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get sectionProfile;

  /// No description provided for @sectionProfileHint.
  ///
  /// In en, this message translates to:
  /// **'Name, email, gender, date of birth'**
  String get sectionProfileHint;

  /// No description provided for @sectionWallet.
  ///
  /// In en, this message translates to:
  /// **'Wallet'**
  String get sectionWallet;

  /// No description provided for @sectionWalletHint.
  ///
  /// In en, this message translates to:
  /// **'Balance and history'**
  String get sectionWalletHint;

  /// No description provided for @sectionReferHint.
  ///
  /// In en, this message translates to:
  /// **'Invite friends, both get credit'**
  String get sectionReferHint;

  /// No description provided for @sectionPlaces.
  ///
  /// In en, this message translates to:
  /// **'Saved places'**
  String get sectionPlaces;

  /// No description provided for @sectionPlacesHint.
  ///
  /// In en, this message translates to:
  /// **'Home, work and favourites'**
  String get sectionPlacesHint;

  /// No description provided for @sectionTravellers.
  ///
  /// In en, this message translates to:
  /// **'Saved travellers'**
  String get sectionTravellers;

  /// No description provided for @sectionTravellersHint.
  ///
  /// In en, this message translates to:
  /// **'Fill bookings in one tap'**
  String get sectionTravellersHint;

  /// No description provided for @sectionSafety.
  ///
  /// In en, this message translates to:
  /// **'Safety'**
  String get sectionSafety;

  /// No description provided for @sectionSafetyHint.
  ///
  /// In en, this message translates to:
  /// **'Emergency contacts, trip sharing'**
  String get sectionSafetyHint;

  /// No description provided for @sectionLicence.
  ///
  /// In en, this message translates to:
  /// **'Driving licence'**
  String get sectionLicence;

  /// No description provided for @sectionLicenceHint.
  ///
  /// In en, this message translates to:
  /// **'Needed for self-drive'**
  String get sectionLicenceHint;

  /// No description provided for @sectionSupport.
  ///
  /// In en, this message translates to:
  /// **'Support'**
  String get sectionSupport;

  /// No description provided for @sectionSupportHint.
  ///
  /// In en, this message translates to:
  /// **'Tickets and callback requests'**
  String get sectionSupportHint;

  /// No description provided for @sectionBusiness.
  ///
  /// In en, this message translates to:
  /// **'Business / GST'**
  String get sectionBusiness;

  /// No description provided for @sectionBusinessHint.
  ///
  /// In en, this message translates to:
  /// **'GST details on invoices'**
  String get sectionBusinessHint;

  /// No description provided for @sectionPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Privacy & data'**
  String get sectionPrivacy;

  /// No description provided for @sectionPrivacyHint.
  ///
  /// In en, this message translates to:
  /// **'Download your data, privacy notice'**
  String get sectionPrivacyHint;

  /// No description provided for @sectionSecurity.
  ///
  /// In en, this message translates to:
  /// **'Login & security'**
  String get sectionSecurity;

  /// No description provided for @sectionSecurityHint.
  ///
  /// In en, this message translates to:
  /// **'Number, devices, delete account'**
  String get sectionSecurityHint;

  /// No description provided for @licenceVerified.
  ///
  /// In en, this message translates to:
  /// **'Verified'**
  String get licenceVerified;

  /// No description provided for @licenceInReview.
  ///
  /// In en, this message translates to:
  /// **'In review'**
  String get licenceInReview;

  /// No description provided for @licenceNotApproved.
  ///
  /// In en, this message translates to:
  /// **'Not approved'**
  String get licenceNotApproved;

  /// No description provided for @licenceAdd.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get licenceAdd;

  /// No description provided for @loginTitle.
  ///
  /// In en, this message translates to:
  /// **'Login or sign up'**
  String get loginTitle;

  /// No description provided for @loginOtpTitle.
  ///
  /// In en, this message translates to:
  /// **'Verify OTP'**
  String get loginOtpTitle;

  /// No description provided for @loginProfileTitle.
  ///
  /// In en, this message translates to:
  /// **'Complete your profile'**
  String get loginProfileTitle;

  /// No description provided for @loginIntro.
  ///
  /// In en, this message translates to:
  /// **'One account for rides, buses, holidays and rentals. New here? We\'ll create your account after the OTP.'**
  String get loginIntro;

  /// No description provided for @loginMobile.
  ///
  /// In en, this message translates to:
  /// **'Mobile number'**
  String get loginMobile;

  /// No description provided for @loginUseSim.
  ///
  /// In en, this message translates to:
  /// **'Use a number on this phone'**
  String get loginUseSim;

  /// No description provided for @loginChangeNumber.
  ///
  /// In en, this message translates to:
  /// **'Change number'**
  String get loginChangeNumber;

  /// No description provided for @loginSendOtp.
  ///
  /// In en, this message translates to:
  /// **'Send OTP'**
  String get loginSendOtp;

  /// No description provided for @loginPrivacy.
  ///
  /// In en, this message translates to:
  /// **'How we use your data: read our privacy notice.'**
  String get loginPrivacy;

  /// No description provided for @loginCodeSent.
  ///
  /// In en, this message translates to:
  /// **'Enter the 4-digit code sent to {phone}.'**
  String loginCodeSent(Object phone);

  /// No description provided for @loginChange.
  ///
  /// In en, this message translates to:
  /// **'Change'**
  String get loginChange;

  /// No description provided for @loginDemoOtp.
  ///
  /// In en, this message translates to:
  /// **'Demo: no SMS is sent. Use OTP {otp}'**
  String loginDemoOtp(Object otp);

  /// No description provided for @loginVerify.
  ///
  /// In en, this message translates to:
  /// **'Verify & continue'**
  String get loginVerify;

  /// No description provided for @loginYoureIn.
  ///
  /// In en, this message translates to:
  /// **'You\'re in! Tell us your name so drivers and bus operators know who to look for.'**
  String get loginYoureIn;

  /// No description provided for @loginFullName.
  ///
  /// In en, this message translates to:
  /// **'Full name'**
  String get loginFullName;

  /// No description provided for @loginNameExample.
  ///
  /// In en, this message translates to:
  /// **'e.g. Priya Raman'**
  String get loginNameExample;

  /// No description provided for @loginEmailOptional.
  ///
  /// In en, this message translates to:
  /// **'Email (optional)'**
  String get loginEmailOptional;

  /// No description provided for @loginEmailHint.
  ///
  /// In en, this message translates to:
  /// **'For tickets and invoices'**
  String get loginEmailHint;

  /// No description provided for @loginReferralCode.
  ///
  /// In en, this message translates to:
  /// **'Referral code'**
  String get loginReferralCode;

  /// No description provided for @loginReferralBonus.
  ///
  /// In en, this message translates to:
  /// **'You and your friend each get {amount} in your wallets.'**
  String loginReferralBonus(Object amount);

  /// No description provided for @loginHaveCode.
  ///
  /// In en, this message translates to:
  /// **'Have a referral code?'**
  String get loginHaveCode;

  /// No description provided for @loginCreate.
  ///
  /// In en, this message translates to:
  /// **'Create my account'**
  String get loginCreate;

  /// No description provided for @loginErrPhone.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid 10-digit mobile number'**
  String get loginErrPhone;

  /// No description provided for @loginErrName.
  ///
  /// In en, this message translates to:
  /// **'Please enter your name'**
  String get loginErrName;

  /// No description provided for @loginErrEmail.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid email or leave it empty'**
  String get loginErrEmail;

  /// No description provided for @loginRestored.
  ///
  /// In en, this message translates to:
  /// **'Welcome back! Your account deletion was cancelled.'**
  String get loginRestored;

  /// No description provided for @loginWelcomeBack.
  ///
  /// In en, this message translates to:
  /// **'Welcome back, {name}!'**
  String loginWelcomeBack(Object name);

  /// No description provided for @loginReferralApplied.
  ///
  /// In en, this message translates to:
  /// **'Referral applied: {amount} added to your wallet'**
  String loginReferralApplied(Object amount);

  /// No description provided for @loginReferralRetry.
  ///
  /// In en, this message translates to:
  /// **'You can try another code or continue without one.'**
  String get loginReferralRetry;

  /// No description provided for @loginWelcomeNew.
  ///
  /// In en, this message translates to:
  /// **'Welcome to QuikFly, {name}!'**
  String loginWelcomeNew(Object name);

  /// No description provided for @loginWalletCredit.
  ///
  /// In en, this message translates to:
  /// **'{amount} welcome credit is in your wallet.'**
  String loginWalletCredit(Object amount);

  /// No description provided for @otpLabel.
  ///
  /// In en, this message translates to:
  /// **'OTP'**
  String get otpLabel;

  /// No description provided for @privacyTitle.
  ///
  /// In en, this message translates to:
  /// **'Your privacy'**
  String get privacyTitle;

  /// No description provided for @privacyBefore.
  ///
  /// In en, this message translates to:
  /// **'Before you continue, here\'s how QuikFly uses your data:'**
  String get privacyBefore;

  /// No description provided for @privacyReadFull.
  ///
  /// In en, this message translates to:
  /// **'Read the full privacy notice'**
  String get privacyReadFull;

  /// No description provided for @privacyReadFullWhy.
  ///
  /// In en, this message translates to:
  /// **'Details, your rights and who to contact.'**
  String get privacyReadFullWhy;

  /// No description provided for @privacyAgree.
  ///
  /// In en, this message translates to:
  /// **'I agree, continue'**
  String get privacyAgree;

  /// No description provided for @privacyDecline.
  ///
  /// In en, this message translates to:
  /// **'Don\'t agree, sign me out'**
  String get privacyDecline;

  /// No description provided for @privacyLastUpdated.
  ///
  /// In en, this message translates to:
  /// **'Last updated {date}'**
  String privacyLastUpdated(Object date);

  /// No description provided for @privacyNoticeSub.
  ///
  /// In en, this message translates to:
  /// **'How QuikFly handles your personal data. Last updated {date}.'**
  String privacyNoticeSub(Object date);

  /// No description provided for @privacyInShort.
  ///
  /// In en, this message translates to:
  /// **'In short'**
  String get privacyInShort;

  /// No description provided for @privacyContactTitle.
  ///
  /// In en, this message translates to:
  /// **'Contact the Grievance Officer'**
  String get privacyContactTitle;

  /// No description provided for @privacyContactSub.
  ///
  /// In en, this message translates to:
  /// **'Questions, corrections, complaints or nominating someone: write or call. We reply within 30 days.'**
  String get privacyContactSub;

  /// No description provided for @privacySignedInHint.
  ///
  /// In en, this message translates to:
  /// **'Signed in? Download your data or delete your account from Account → Privacy & data.'**
  String get privacySignedInHint;

  /// No description provided for @privacyRightsSub.
  ///
  /// In en, this message translates to:
  /// **'Your rights under India\'s Digital Personal Data Protection Act.'**
  String get privacyRightsSub;

  /// No description provided for @privacyAgreedOn.
  ///
  /// In en, this message translates to:
  /// **'You agreed to the notice of {date}.'**
  String privacyAgreedOn(Object date);

  /// No description provided for @privacyNotAgreed.
  ///
  /// In en, this message translates to:
  /// **'You haven\'t agreed to the privacy notice yet.'**
  String get privacyNotAgreed;

  /// No description provided for @privacyReadIt.
  ///
  /// In en, this message translates to:
  /// **'Read the privacy notice'**
  String get privacyReadIt;

  /// No description provided for @privacyDownloadTitle.
  ///
  /// In en, this message translates to:
  /// **'Download your data'**
  String get privacyDownloadTitle;

  /// No description provided for @privacyDownloadSub.
  ///
  /// In en, this message translates to:
  /// **'One file with your profile, bookings, wallet, saved places, travellers, contacts, notifications and support requests.'**
  String get privacyDownloadSub;

  /// No description provided for @privacyDownloadButton.
  ///
  /// In en, this message translates to:
  /// **'Download (JSON)'**
  String get privacyDownloadButton;

  /// No description provided for @privacyDownloading.
  ///
  /// In en, this message translates to:
  /// **'Your data is downloading'**
  String get privacyDownloading;

  /// No description provided for @privacyEraseTitle.
  ///
  /// In en, this message translates to:
  /// **'Correct or erase'**
  String get privacyEraseTitle;

  /// No description provided for @privacyEraseSub.
  ///
  /// In en, this message translates to:
  /// **'Fix your details in your profile. To withdraw consent and erase your data, delete your account: it closes now and is erased after {days} days.'**
  String privacyEraseSub(Object days);

  /// No description provided for @privacyEraseElsewhere.
  ///
  /// In en, this message translates to:
  /// **'Fix your details in your profile. To withdraw consent and erase your data, delete your account in the QuikFly app or on the website (Account → Login & security).'**
  String get privacyEraseElsewhere;

  /// No description provided for @privacyGoSecurity.
  ///
  /// In en, this message translates to:
  /// **'Go to Login & security'**
  String get privacyGoSecurity;

  /// No description provided for @privacyDeleteAccount.
  ///
  /// In en, this message translates to:
  /// **'Delete account'**
  String get privacyDeleteAccount;

  /// No description provided for @privacyQuestionsTitle.
  ///
  /// In en, this message translates to:
  /// **'Questions or complaints'**
  String get privacyQuestionsTitle;

  /// No description provided for @privacyQuestionsSub.
  ///
  /// In en, this message translates to:
  /// **'Write to our Grievance Officer, {name}, at {email} or call {phone}.'**
  String privacyQuestionsSub(Object email, Object name, Object phone);

  /// No description provided for @navMain.
  ///
  /// In en, this message translates to:
  /// **'Main menu'**
  String get navMain;
}

class _LDelegate extends LocalizationsDelegate<L> {
  const _LDelegate();

  @override
  Future<L> load(Locale locale) {
    return SynchronousFuture<L>(lookupL(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'hi', 'ta'].contains(locale.languageCode);

  @override
  bool shouldReload(_LDelegate old) => false;
}

L lookupL(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return LEn();
    case 'hi':
      return LHi();
    case 'ta':
      return LTa();
  }

  throw FlutterError(
    'L.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}

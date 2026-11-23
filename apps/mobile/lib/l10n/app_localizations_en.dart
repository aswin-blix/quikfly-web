// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class LEn extends L {
  LEn([String locale = 'en']) : super(locale);

  @override
  String get langName => 'English';

  @override
  String get langMenu => 'Language';

  @override
  String get langNote =>
      'Tamil and Hindi are new. Tell us if anything reads wrong.';

  @override
  String get navHome => 'Home';

  @override
  String get navServices => 'Services';

  @override
  String get navOffers => 'Offers';

  @override
  String get navMyTrips => 'My Trips';

  @override
  String get navAccount => 'Account';

  @override
  String get navLogin => 'Login';

  @override
  String get navHelp => 'Help';

  @override
  String get navNotifications => 'Notifications';

  @override
  String navNotificationsUnread(Object count) {
    return 'Notifications, $count unread';
  }

  @override
  String get navAllServices => 'All services';

  @override
  String get navWallet => 'Wallet';

  @override
  String get navMyAccount => 'My account';

  @override
  String navUpcoming(Object count) {
    return '$count upcoming';
  }

  @override
  String get navLogoHome => 'QuikFly home';

  @override
  String get bannerDemo => 'DEMO MODE · sample data';

  @override
  String get bannerPreview => 'PREVIEW';

  @override
  String get bannerOtp => 'login OTP is';

  @override
  String get serviceBikeTitle => 'Bike';

  @override
  String get serviceBikeAction => 'Bike Taxi';

  @override
  String get serviceBikeNav => 'Bike Taxi';

  @override
  String get serviceBikeTagline => 'Beat the traffic';

  @override
  String get serviceBikeBlurb =>
      'Bikes, e-bikes & autos at your doorstep in under 5 minutes.';

  @override
  String get serviceCarTitle => 'Car';

  @override
  String get serviceCarAction => 'Car Ride';

  @override
  String get serviceCarNav => 'Cabs';

  @override
  String get serviceCarTagline => 'Ride in comfort';

  @override
  String get serviceCarBlurb =>
      'Mini, Sedan, SUV or Prime with upfront fares and verified drivers.';

  @override
  String get serviceBusTitle => 'Travels';

  @override
  String get serviceBusAction => 'Bus Booking';

  @override
  String get serviceBusNav => 'Bus';

  @override
  String get serviceBusTagline => 'Pick your seat';

  @override
  String get serviceBusBlurb =>
      'Intercity sleeper & seater buses with live seat maps.';

  @override
  String get serviceToursTitle => 'Holiday Trip';

  @override
  String get serviceToursAction => 'Tour Packages';

  @override
  String get serviceToursNav => 'Holidays';

  @override
  String get serviceToursTagline => 'Curated getaways';

  @override
  String get serviceToursBlurb =>
      'Handpicked holidays across India and abroad, all-inclusive.';

  @override
  String get serviceRentTitle => 'Rental Car';

  @override
  String get serviceRentAction => 'Rent a Car';

  @override
  String get serviceRentNav => 'Rent a Car';

  @override
  String get serviceRentTagline => 'Drive yourself';

  @override
  String get serviceRentBlurb =>
      'Self-drive or chauffeur cars by the hour, day or week.';

  @override
  String get serviceRentalsTitle => 'Rental Trip';

  @override
  String get serviceRentalsAction => 'Travel Rentals';

  @override
  String get serviceRentalsNav => 'Group Travel';

  @override
  String get serviceRentalsTagline => 'Travel together';

  @override
  String get serviceRentalsBlurb =>
      'Tempo travellers, Urbanias & coaches for family and group trips.';

  @override
  String get serviceParcelTitle => 'Parcel';

  @override
  String get serviceParcelAction => 'Send a Parcel';

  @override
  String get serviceParcelNav => 'Parcels';

  @override
  String get serviceParcelTagline => 'Send it by bus';

  @override
  String get serviceParcelBlurb =>
      'Parcels between cities on the bus, counter to counter.';

  @override
  String get servicesSheetTitle => 'What would you like to book?';

  @override
  String get servicesSheetPartner => 'Drive or list your fleet with QuikFly';

  @override
  String get footerTagline =>
      'Rides, buses, holidays and rentals in one app. One login, one wallet, every journey.';

  @override
  String get footerAndroid => 'Android app (APK)';

  @override
  String get footerIphone => 'iPhone: coming later';

  @override
  String get footerCompany => 'Company';

  @override
  String get footerSupport => 'Support';

  @override
  String get footerSafety => 'Safety';

  @override
  String get footerCancellation => 'Cancellation & refunds';

  @override
  String footerRights(Object year) {
    return '© $year QuikFly. All rights reserved.';
  }

  @override
  String get footerMadeBy => 'Made in Chennai · Designed & built by';

  @override
  String get linkHelpCentre => 'Help centre';

  @override
  String get linkBecomePartner => 'Become a partner';

  @override
  String get linkMyTrips => 'My trips';

  @override
  String get linkOffersCoupons => 'Offers & coupons';

  @override
  String get linkPrivacyNotice => 'Privacy notice';

  @override
  String get linkSafetyContacts => 'Safety & emergency contacts';

  @override
  String get linkReferEarn => 'Refer & earn';

  @override
  String get accountYour => 'Your account';

  @override
  String get accountEditProfile => 'Edit profile';

  @override
  String get accountAddName => 'Add your name';

  @override
  String get accountWallet => 'QuikFly wallet';

  @override
  String get accountHistory => 'History';

  @override
  String get accountAllSettings => 'All account settings';

  @override
  String get accountSettings => 'Account settings';

  @override
  String get accountSupportTickets => 'Support tickets';

  @override
  String get accountSignOut => 'Sign out';

  @override
  String get accountSignedOut => 'Signed out';

  @override
  String get accountSignInPrompt =>
      'Sign in to manage your profile, wallet, saved places and safety settings.';

  @override
  String get accountOneAccount =>
      'One account for rides, buses, holidays and rentals';

  @override
  String accountNewWallet(Object amount) {
    return 'New accounts start with $amount in the wallet.';
  }

  @override
  String get accountTheme => 'Theme';

  @override
  String get accountThemeAuto => 'Auto';

  @override
  String get accountThemeLight => 'Light';

  @override
  String get accountThemeDark => 'Dark';

  @override
  String get sectionProfile => 'Profile';

  @override
  String get sectionProfileHint => 'Name, email, gender, date of birth';

  @override
  String get sectionWallet => 'Wallet';

  @override
  String get sectionWalletHint => 'Balance and history';

  @override
  String get sectionReferHint => 'Invite friends, both get credit';

  @override
  String get sectionPlaces => 'Saved places';

  @override
  String get sectionPlacesHint => 'Home, work and favourites';

  @override
  String get sectionTravellers => 'Saved travellers';

  @override
  String get sectionTravellersHint => 'Fill bookings in one tap';

  @override
  String get sectionSafety => 'Safety';

  @override
  String get sectionNotificationsHint => 'Trip updates in this browser';

  @override
  String get sectionSafetyHint => 'Emergency contacts, trip sharing';

  @override
  String get sectionLicence => 'Driving licence';

  @override
  String get sectionLicenceHint => 'Needed for self-drive';

  @override
  String get sectionSupport => 'Support';

  @override
  String get sectionSupportHint => 'Tickets and callback requests';

  @override
  String get sectionBusiness => 'Business / GST';

  @override
  String get sectionBusinessHint => 'GST details on invoices';

  @override
  String get sectionPrivacy => 'Privacy & data';

  @override
  String get sectionPrivacyHint => 'Download your data, privacy notice';

  @override
  String get sectionSecurity => 'Login & security';

  @override
  String get sectionSecurityHint => 'Number, devices, delete account';

  @override
  String get licenceVerified => 'Verified';

  @override
  String get licenceInReview => 'In review';

  @override
  String get licenceNotApproved => 'Not approved';

  @override
  String get licenceAdd => 'Add';

  @override
  String get loginTitle => 'Login or sign up';

  @override
  String get loginOtpTitle => 'Verify OTP';

  @override
  String get loginProfileTitle => 'Complete your profile';

  @override
  String get loginIntro =>
      'One account for rides, buses, holidays and rentals. New here? We\'ll create your account after the OTP.';

  @override
  String get loginMobile => 'Mobile number';

  @override
  String get loginUseSim => 'Use a number on this phone';

  @override
  String get loginChangeNumber => 'Change number';

  @override
  String get loginSendOtp => 'Send OTP';

  @override
  String get loginPrivacy => 'How we use your data: read our privacy notice.';

  @override
  String loginCodeSent(Object phone) {
    return 'Enter the 4-digit code sent to $phone.';
  }

  @override
  String get loginChange => 'Change';

  @override
  String loginDemoOtp(Object otp) {
    return 'Demo: no SMS is sent. Use OTP $otp';
  }

  @override
  String get loginVerify => 'Verify & continue';

  @override
  String get loginYoureIn =>
      'You\'re in! Tell us your name so drivers and bus operators know who to look for.';

  @override
  String get loginFullName => 'Full name';

  @override
  String get loginNameExample => 'e.g. Priya Raman';

  @override
  String get loginEmailOptional => 'Email (optional)';

  @override
  String get loginEmailHint => 'For tickets and invoices';

  @override
  String get loginReferralCode => 'Referral code';

  @override
  String loginReferralBonus(Object amount) {
    return 'You and your friend each get $amount in your wallets.';
  }

  @override
  String get loginHaveCode => 'Have a referral code?';

  @override
  String get loginCreate => 'Create my account';

  @override
  String get loginErrPhone => 'Enter a valid 10-digit mobile number';

  @override
  String get loginErrName => 'Please enter your name';

  @override
  String get loginErrEmail => 'Enter a valid email or leave it empty';

  @override
  String get loginRestored =>
      'Welcome back! Your account deletion was cancelled.';

  @override
  String loginWelcomeBack(Object name) {
    return 'Welcome back, $name!';
  }

  @override
  String loginReferralApplied(Object amount) {
    return 'Referral applied: $amount added to your wallet';
  }

  @override
  String get loginReferralRetry =>
      'You can try another code or continue without one.';

  @override
  String loginWelcomeNew(Object name) {
    return 'Welcome to QuikFly, $name!';
  }

  @override
  String loginWalletCredit(Object amount) {
    return '$amount welcome credit is in your wallet.';
  }

  @override
  String get otpLabel => 'OTP';

  @override
  String get privacyTitle => 'Your privacy';

  @override
  String get privacyBefore =>
      'Before you continue, here\'s how QuikFly uses your data:';

  @override
  String get privacyReadFull => 'Read the full privacy notice';

  @override
  String get privacyReadFullWhy => 'Details, your rights and who to contact.';

  @override
  String get privacyAgree => 'I agree, continue';

  @override
  String get privacyDecline => 'Don\'t agree, sign me out';

  @override
  String privacyLastUpdated(Object date) {
    return 'Last updated $date';
  }

  @override
  String privacyNoticeSub(Object date) {
    return 'How QuikFly handles your personal data. Last updated $date.';
  }

  @override
  String get privacyInShort => 'In short';

  @override
  String get privacyContactTitle => 'Contact the Grievance Officer';

  @override
  String get privacyContactSub =>
      'Questions, corrections, complaints or nominating someone: write or call. We reply within 30 days.';

  @override
  String get privacySignedInHint =>
      'Signed in? Download your data or delete your account from Account → Privacy & data.';

  @override
  String get privacyRightsSub =>
      'Your rights under India\'s Digital Personal Data Protection Act.';

  @override
  String privacyAgreedOn(Object date) {
    return 'You agreed to the notice of $date.';
  }

  @override
  String get privacyNotAgreed =>
      'You haven\'t agreed to the privacy notice yet.';

  @override
  String get privacyReadIt => 'Read the privacy notice';

  @override
  String get privacyDownloadTitle => 'Download your data';

  @override
  String get privacyDownloadSub =>
      'One file with your profile, bookings, wallet, saved places, travellers, contacts, notifications and support requests.';

  @override
  String get privacyDownloadButton => 'Download (JSON)';

  @override
  String get privacyDownloading => 'Your data is downloading';

  @override
  String get privacyEraseTitle => 'Correct or erase';

  @override
  String privacyEraseSub(Object days) {
    return 'Fix your details in your profile. To withdraw consent and erase your data, delete your account: it closes now and is erased after $days days.';
  }

  @override
  String get privacyEraseElsewhere =>
      'Fix your details in your profile. To withdraw consent and erase your data, delete your account in the QuikFly app or on the website (Account → Login & security).';

  @override
  String get privacyGoSecurity => 'Go to Login & security';

  @override
  String get privacyDeleteAccount => 'Delete account';

  @override
  String get privacyQuestionsTitle => 'Questions or complaints';

  @override
  String privacyQuestionsSub(Object email, Object name, Object phone) {
    return 'Write to our Grievance Officer, $name, at $email or call $phone.';
  }

  @override
  String get navMain => 'Main menu';
}

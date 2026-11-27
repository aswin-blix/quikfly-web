// A phone notification and its inbox row open the same screen (core/notifications.dart), and
// QuikFly Partner never links to a customer-only page.
import 'package:flutter_test/flutter_test.dart';
import 'package:quikfly/core/notifications.dart';
import 'package:quikfly/state/catalog.dart';

void main() {
  const c = NotificationScope.customer;
  test('customer notifications open their screen', () {
    expect(notificationTarget('booking.confirmed', 'B1', c), '/trips');
    expect(notificationTarget('ride.reminder', 'B1', c), '/trips');
    expect(notificationTarget('parcel.ready', 'B2', c), '/parcel/B2');
    expect(notificationTarget('credits.earned', 'B3', c), '/account/wallet');
    expect(notificationTarget('support.reply', null, c), '/support');
    expect(notificationTarget('licence.approved', null, c), '/account/licence');
    expect(notificationTarget('privacy.inactive', null, c), isNull);
  });

  test('partner notifications never open a page of their own', () {
    for (final kind in ['vendor.trip', 'vendor.payout', 'vendor.fleet', 'booking.confirmed']) {
      expect(notificationTarget(kind, 'B1', NotificationScope.partner), isNull);
    }
  });

  test('captain notifications open the Captain home, where the offer or the ride is', () {
    for (final kind in ['driver.offer', 'driver.cancelled']) {
      expect(notificationTarget(kind, null, NotificationScope.captain), '/');
    }
  });

  test('My Trips is a tab switch, the rest open on top', () {
    expect(notificationSwitchesTab('/trips'), isTrue);
    expect(notificationSwitchesTab('/'), isTrue);
    expect(notificationSwitchesTab('/parcel/B2'), isFalse);
  });
}

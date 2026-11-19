// The SIM number Google's picker returns, cleaned to the 10 digits sign-in expects.
import 'package:flutter_test/flutter_test.dart';
import 'package:quikfly/core/phone_hint.dart';

void main() {
  test('Indian mobiles in any format become 10 digits', () {
    expect(tenDigitMobile('+919488131904'), '9488131904');
    expect(tenDigitMobile('+91 94881 31904'), '9488131904');
    expect(tenDigitMobile('094881 31904'), '9488131904');
    expect(tenDigitMobile('9488131904'), '9488131904');
  });

  test('anything else is rejected, so the user types the number', () {
    expect(tenDigitMobile('+1 415 555 0123'), isNull); // foreign
    expect(tenDigitMobile('+44 7911 123456'), isNull);
    expect(tenDigitMobile('0442 2345678'), isNull); // landline
    expect(tenDigitMobile('12345'), isNull);
    expect(tenDigitMobile(''), isNull);
  });
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export function toBengaliDigits(value) {
  return String(value).replace(/[0-9]/g, digit => BN_DIGITS[Number(digit)]);
}

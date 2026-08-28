/** Partnership key, order-independent: "loId:hiId". */
export const partnerKey = (a: number, b: number) =>
  a < b ? `${a}:${b}` : `${b}:${a}`;

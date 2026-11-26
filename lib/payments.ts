// The simulated payment screen (approve / cancel without a real charge) is allowed only on staging,
// or when TEST_PAYMENTS=1 (local tests). In production it is closed until a real payment gateway is connected,
// so nobody can mark an order as paid for free.
export const testPayments = () => process.env.STAGING === '1' || process.env.TEST_PAYMENTS === '1';

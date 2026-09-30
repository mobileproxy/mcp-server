/* Where the account owner completes a purchase when this server only quotes prices (hosted mode). */
const UTM = 'utm_source=mcp&utm_medium=quote';

export const CHECKOUT_URL = `https://mobileproxy.space/user.html?buyproxy&${UTM}`;
export const DASHBOARD_URL = `https://mobileproxy.space/user.html?${UTM}`;

import msal from '@azure/msal-node';

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_AD_CLIENT_ID || 'YOUR_CLIENT_ID',
    authority: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID || 'YOUR_TENANT_ID'}`,
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET || 'YOUR_CLIENT_SECRET',
  },
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

export const REDIRECT_URI = process.env.AZURE_AD_REDIRECT_URI || 'http://localhost:3001/api/auth/callback';

export default cca;

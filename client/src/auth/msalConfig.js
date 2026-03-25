import { PublicClientApplication } from '@azure/msal-browser';

const clientId = import.meta.env.VITE_AZURE_AD_CLIENT_ID;
const tenantId = import.meta.env.VITE_AZURE_AD_TENANT_ID;
const redirectUri = import.meta.env.VITE_AZURE_AD_REDIRECT_URI || 'http://localhost:3000';

export const isAzureAdConfigured = !!(clientId && tenantId);

export const loginRequest = { scopes: ['openid', 'profile', 'email'] };

export const msalInstance = isAzureAdConfigured
  ? new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri,
      },
      cache: {
        cacheLocation: 'sessionStorage',
      },
    })
  : null;

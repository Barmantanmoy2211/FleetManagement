import { Amplify } from "aws-amplify";
import { ENV_KEYS } from "@fleet/constants";

export function configureAmplify() {
  const userPoolId = import.meta.env[ENV_KEYS.VITE_COGNITO_USER_POOL_ID];
  const clientId = import.meta.env[ENV_KEYS.VITE_COGNITO_CLIENT_ID];

  if (!userPoolId || !clientId) {
    console.warn("Cognito env vars missing — login will fail until .env.local is configured.");
    return;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId: clientId,
        loginWith: { email: true },
      },
    },
  });
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL || "http://localhost:8000";
}

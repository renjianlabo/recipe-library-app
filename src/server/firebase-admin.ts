import { applicationDefault, cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

type ServerEnvironment = Record<string, string | undefined>;

function serviceAccountFromEnvironment(environment: ServerEnvironment) {
  const encoded = environment.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (encoded) {
    try {
      const parsed = JSON.parse(encoded) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
  }

  const projectId = environment.FIREBASE_PROJECT_ID ?? environment.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = environment.FIREBASE_CLIENT_EMAIL;
  const privateKey = environment.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }
  return null;
}

export function getFirebaseAdminApp(environment: ServerEnvironment = process.env): App {
  const defaultApp = getApps().find((app) => app.name === "[DEFAULT]");
  if (defaultApp) return getApp();

  const serviceAccount = serviceAccountFromEnvironment(environment);
  const projectId = environment.FIREBASE_PROJECT_ID ?? environment.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
}

export function getFirebaseAdminAuth(environment: ServerEnvironment = process.env): Auth {
  return getAuth(getFirebaseAdminApp(environment));
}

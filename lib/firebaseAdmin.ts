import {
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";

import {
  getAuth,
  type Auth,
} from "firebase-admin/auth";

import {
  getFirestore,
  type Firestore,
} from "firebase-admin/firestore";

function getAdminApp(): App {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;

  const useEmulator =
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

  if (useEmulator) {
    if (
      process.env.NODE_ENV === "production" ||
      projectId !== "demo-naya-aerial" ||
      process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
    ) {
      throw new Error(
        "安全限制：Firebase Admin Emulator 測試環境設定不完整"
      );
    }
  }

  if (!useEmulator) {
    if (
      process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST
    ) {
      throw new Error(
        "安全限制：偵測到 Emulator 連線設定，但尚未啟用測試模式"
      );
    }
  }

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

  const privateKey =
    process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId) {
    throw new Error("Firebase Admin 專案 ID 尚未設定");
  }

  if (!useEmulator && (!clientEmail || !privateKey)) {
    throw new Error("Firebase Admin 環境變數尚未設定完整");
  }

  const existingApp = getApps()[0];

  if (existingApp) {
    if (existingApp.options.projectId !== projectId) {
      throw new Error(
        "安全限制：Firebase Admin 專案 ID 不一致"
      );
    }

    return existingApp;
  }

  return useEmulator
    ? initializeApp({ projectId })
    : initializeApp({
        projectId,
        credential: cert({
          projectId,
          clientEmail: clientEmail!,
          privateKey: privateKey!,
        }),
      });
}

function createLazyProxy<T extends object>(
  factory: () => T
): T {
  let instance: T | undefined;

  return new Proxy({} as T, {
    get(_target, property) {
      if (!instance) {
        instance = factory();
      }

      const value = Reflect.get(
        instance,
        property,
        instance
      );

      return typeof value === "function"
        ? value.bind(instance)
        : value;
    },
  });
}

export const adminAuth: Auth = createLazyProxy(() =>
  getAuth(getAdminApp())
);

export const adminDb: Firestore = createLazyProxy(() =>
  getFirestore(getAdminApp())
);

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const PROJECT = "demo-naya-aerial";
const BASE = "http://127.0.0.1:3000";

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const app = initializeApp({ projectId: PROJECT });
const auth = getAuth(app);
const db = getFirestore(app);

async function runCase(label, phone, registryOverrides) {
  const uid = `phone-security-${label}`;
  const email = `${uid}@example.test`;
  const legacyId = `legacy-${uid}`;

  const existing = await auth.getUser(uid).catch((error) => {
    if (error.code === "auth/user-not-found") return null;
    throw error;
  });

  if (existing) {
    throw new Error(`SAFE STOP: Test UID already exists: ${uid}`);
  }

  const refs = [
    db.collection("users").doc(uid),
    db.collection("legacyClaimRequests").doc(uid),
    db.collection("legacyMembers").doc(legacyId),
    db.collection("phoneRegistry").doc(phone),
    db.collection("pointTransactions").doc(`legacy_claim_${uid}`),
    db.collection("rewardTransactions").doc(`legacy_claim_${uid}`)
  ];

  const snapshots = await db.getAll(...refs);

  if (snapshots.some((snapshot) => snapshot.exists)) {
    throw new Error(`SAFE STOP: Test data already exists: ${label}`);
  }

  await auth.createUser({
    uid,
    email,
    emailVerified: true,
    password: "TestPassword123!"
  });

  const batch = db.batch();

  batch.set(refs[0], {
    uid,
    name: `Security Test ${label}`,
    phone,
    phoneNormalized: phone,
    birthdayYear: 1998,
    birthdayMonth: 8,
    birthdayDay: 16,
    points: 2,
    rewardPoints: 1,
    role: "student"
  });

  batch.set(refs[1], {
    uid,
    phone,
    birthdayYear: 1998,
    birthdayMonth: 8,
    birthdayDay: 16,
    status: "pending"
  });

  batch.set(refs[2], {
    name: `Legacy Test ${label}`,
    phone,
    phoneNormalized: phone,
    birthdayYear: 1998,
    birthdayMonth: 8,
    birthdayDay: 16,
    points: 15,
    rewardPoints: 3,
    status: "unclaimed"
  });

  batch.set(refs[3], {
    userId: uid,
    phone,
    ...registryOverrides
  });

  await batch.commit();

  const tokenResponse = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: "TestPassword123!",
        returnSecureToken: true
      })
    }
  );

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.idToken) {
    throw new Error(`Cannot obtain emulator token: ${JSON.stringify(tokenData)}`);
  }

  const response = await fetch(`${BASE}/api/legacy-members/auto-claim`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.idToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  const result = await response.json();

  const [userAfter, legacyAfter, claimAfter, pointTx, rewardTx] =
    await db.getAll(refs[0], refs[2], refs[1], refs[4], refs[5]);

  const passed =
    response.status === 409 &&
    userAfter.data()?.points === 2 &&
    userAfter.data()?.rewardPoints === 1 &&
    legacyAfter.data()?.status === "unclaimed" &&
    claimAfter.data()?.status === "pending" &&
    !pointTx.exists &&
    !rewardTx.exists;

  console.log(`${passed ? "PASS" : "FAIL"}: ${label}`);
  console.log(JSON.stringify({
    httpStatus: response.status,
    response: result,
    points: userAfter.data()?.points,
    rewardPoints: userAfter.data()?.rewardPoints,
    legacyStatus: legacyAfter.data()?.status,
    claimStatus: claimAfter.data()?.status,
    pointTransactionExists: pointTx.exists,
    rewardTransactionExists: rewardTx.exists
  }, null, 2));

  if (!passed) throw new Error(`Security test failed: ${label}`);
}

async function main() {
  const hub = await fetch("http://127.0.0.1:4400/emulators")
    .then((response) => response.json());

  if (!hub.firestore || !hub.auth) {
    throw new Error("SAFE STOP: Required emulators are not running.");
  }

  await runCase("wrong-uid", "0911111101", {
    userId: "another-user"
  });

  await runCase("replaced", "0911111102", {
    status: "replaced"
  });

  console.log("SUCCESS: Phone registry security tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
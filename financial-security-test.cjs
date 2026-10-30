const fs = require("node:fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");

const { doc, setDoc } = require("firebase/firestore");

async function main() {
  const env = await initializeTestEnvironment({
    projectId: "demo-naya-aerial",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: fs.readFileSync("firestore.safe.rules", "utf8")
    }
  });

  try {
    const uid = "security-test-student";

    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        uid,
        role: "student",
        points: 10,
        rewardPoints: 100
      });
    });

    const studentDb = env.authenticatedContext(uid).firestore();

    const tests = [
      {
        name: "會員不能自行建立點數交易紀錄",
        collection: "pointTransactions",
        data: { userId: uid, amount: 999, type: "manual" }
      },
      {
        name: "會員不能自行建立優惠券",
        collection: "userCoupons",
        data: {
          userId: uid,
          status: "available",
          type: "reward"
        }
      },
      {
        name: "會員不能自行建立紅利交易紀錄",
        collection: "rewardTransactions",
        data: {
          userId: uid,
          type: "coupon_redemption",
          amount: -10
        }
      }
    ];

    for (const test of tests) {
      await assertFails(
        setDoc(
          doc(studentDb, test.collection, `security-test-${Date.now()}`),
          test.data
        )
      );

      console.log(`PASS：${test.name}`);
    }

    // 確認管理員仍能建立點數交易紀錄
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "security-test-admin"), {
        uid: "security-test-admin",
        role: "admin",
        points: 0,
        rewardPoints: 0
      });
    });

    const adminDb = env
      .authenticatedContext("security-test-admin")
      .firestore();

    await assertSucceeds(
      setDoc(
        doc(adminDb, "pointTransactions", "security-test-admin-create"),
        {
          userId: uid,
          amount: 10,
          type: "manual"
        }
      )
    );

    console.log("PASS：管理員可以建立點數交易紀錄");

  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error("TEST FAILED:", error);
  process.exitCode = 1;
});
